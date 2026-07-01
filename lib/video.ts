import "server-only";

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { GatheredVideoSource, VideoPlatform, VideoSegment } from "@/lib/types";

const execFileAsync = promisify(execFile);

const YT_DLP_TIMEOUT_MS = 45_000;
const YT_DLP_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const WHISPER_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_BUFFER = 40 * 1024 * 1024;

const ytDlpMetadataSchema = z.object({
  id: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  fulltitle: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  uploader: z.string().nullable().optional(),
  channel: z.string().nullable().optional(),
  creator: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  webpage_url: z.string().nullable().optional(),
  extractor: z.string().nullable().optional(),
});

const whisperOutputSchema = z.object({
  language: z.string().nullable(),
  language_probability: z.number().nullable(),
  duration: z.number().nullable(),
  text: z.string(),
  segments: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      text: z.string(),
    }),
  ),
});

type VideoMetadata = {
  videoId: string | null;
  title: string;
  description: string;
  uploader: string | null;
  durationSeconds: number | null;
  webpageUrl: string | null;
};

type VideoTranscript = {
  text: string;
  language: string | null;
  languageProbability: number | null;
  durationSeconds: number | null;
  segments: VideoSegment[];
};

function numberFromEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getYtDlpPath(): string {
  return process.env.YT_DLP_PATH || "yt-dlp";
}

function getFfmpegPath(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

// Some launch methods for `next dev`/`next start` (IDE task runners, GUI
// apps, non-login shells) don't inherit a full interactive-shell PATH, so
// yt-dlp's own ffmpeg/ffprobe lookup (and our direct ffmpeg call below) can
// silently fail to find those binaries even though they're installed via
// Homebrew. Append the common install locations as a safety net.
function getChildEnv(): NodeJS.ProcessEnv {
  const extraPaths = ["/opt/homebrew/bin", "/usr/local/bin"];
  const currentPath = process.env.PATH || "";
  const missing = extraPaths.filter((candidate) => !currentPath.split(path.delimiter).includes(candidate));
  if (missing.length === 0) return process.env;
  return { ...process.env, PATH: [currentPath, ...missing].filter(Boolean).join(path.delimiter) };
}

function getWhisperPythonPath(): string {
  // Default to a bare command name resolved via PATH so the Next.js/Turbopack
  // bundler never sees a literal on-disk path (e.g. into a venv with symlinks
  // that point outside the project) that it tries to statically trace as an
  // asset. Set WHISPER_PYTHON_PATH (e.g. ".venv/bin/python3" or an absolute
  // path) in .env to point at the venv where faster-whisper is installed.
  const configured = process.env.WHISPER_PYTHON_PATH || "python3";
  if (path.isAbsolute(configured) || !configured.includes("/")) return configured;
  return path.join(/* turbopackIgnore: true */ process.cwd(), configured);
}

function readExecError(error: unknown): { message: string; stderr: string } {
  if (error && typeof error === "object") {
    const stderr =
      "stderr" in error && typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr.trim()
        : "";
    const message = error instanceof Error ? error.message : String(error);
    return { message, stderr };
  }
  return { message: String(error), stderr: "" };
}

async function fetchVideoMetadata(sourceUrl: string): Promise<VideoMetadata> {
  let stdout: string;
  try {
    const result = await execFileAsync(
      getYtDlpPath(),
      ["--dump-single-json", "--no-warnings", "--no-playlist", "--skip-download", sourceUrl],
      { maxBuffer: MAX_BUFFER, timeout: YT_DLP_TIMEOUT_MS, env: getChildEnv() },
    );
    stdout = result.stdout;
  } catch (error) {
    const { message, stderr } = readExecError(error);
    throw new Error(
      `Không đọc được thông tin video (yt-dlp): ${stderr || message}. Kiểm tra yt-dlp đã cài (brew install yt-dlp) và link còn khả dụng.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error("yt-dlp trả về dữ liệu không hợp lệ khi đọc thông tin video.");
  }

  const parsed = ytDlpMetadataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Không đọc được thông tin video từ yt-dlp.");
  }

  const data = parsed.data;
  return {
    videoId: data.id ?? null,
    title: data.title || data.fulltitle || "Video không có tiêu đề",
    description: data.description ?? "",
    uploader: data.uploader || data.channel || data.creator || null,
    durationSeconds: typeof data.duration === "number" ? Math.round(data.duration) : null,
    webpageUrl: data.webpage_url ?? null,
  };
}

async function findDownloadedFile(tmpDir: string, prefix: string): Promise<string | null> {
  const entries = await fs.readdir(tmpDir);
  const match = entries.find((entry) => entry.startsWith(`${prefix}.`));
  return match ? path.join(tmpDir, match) : null;
}

// Download the raw stream first (no yt-dlp postprocessing), then extract the
// audio ourselves with a direct ffmpeg call. yt-dlp's built-in `-x` audio
// extraction shells out to `ffprobe` internally to detect the codec, which
// has proven flaky for some TikTok/Facebook formats ("unable to obtain file
// audio codec with ffprobe"). Doing the ffmpeg step explicitly avoids that
// dependency and gives clearer errors when it does fail.
async function downloadVideoAudio(sourceUrl: string, tmpDir: string): Promise<string> {
  const sourceTemplate = path.join(tmpDir, "source.%(ext)s");
  try {
    await execFileAsync(
      getYtDlpPath(),
      [
        "-f",
        // Format selection is quirky per platform:
        // - YouTube exposes real audio-only formats, so `bestaudio` is ideal
        //   (smallest download).
        // - TikTok has no audio-only format, and its bytevc1/h265 formats
        //   advertise an aac track in metadata but actually download
        //   video-only (silent). Its h264/avc formats carry real audio, so we
        //   prefer those before falling back to plain `best`.
        // We can't trust the `acodec` filter here precisely because TikTok's
        // h265 metadata lies about it, hence the codec-based preference.
        "bestaudio/best[vcodec*=h264]/best[vcodec*=avc]/best",
        "--no-playlist",
        "--no-warnings",
        "--no-part",
        "-o",
        sourceTemplate,
        sourceUrl,
      ],
      { maxBuffer: MAX_BUFFER, timeout: YT_DLP_DOWNLOAD_TIMEOUT_MS, env: getChildEnv() },
    );
  } catch (error) {
    const { message, stderr } = readExecError(error);
    throw new Error(`Không tải được video (yt-dlp): ${stderr || message}`);
  }

  const downloadedPath = await findDownloadedFile(tmpDir, "source");
  if (!downloadedPath) {
    throw new Error("yt-dlp không tạo được file nào từ video này.");
  }

  const audioPath = path.join(tmpDir, "audio.mp3");
  try {
    await execFileAsync(
      getFfmpegPath(),
      [
        "-y",
        "-i",
        downloadedPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-acodec",
        "libmp3lame",
        "-q:a",
        "5",
        audioPath,
      ],
      { maxBuffer: MAX_BUFFER, timeout: YT_DLP_DOWNLOAD_TIMEOUT_MS, env: getChildEnv() },
    );
  } catch (error) {
    const { message, stderr } = readExecError(error);
    if (/does not contain any stream|Output file does not contain/i.test(stderr)) {
      throw new Error("Video này không có âm thanh để phân tích (không tìm được audio track).");
    }
    throw new Error(`Không tách được âm thanh từ video (ffmpeg): ${stderr || message}`);
  }

  try {
    await fs.access(audioPath);
  } catch {
    throw new Error("Không tạo được file âm thanh từ video này.");
  }
  return audioPath;
}

async function transcribeAudio(audioPath: string): Promise<VideoTranscript> {
  const pythonPath = getWhisperPythonPath();
  const scriptPath = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "transcribe.py");
  const modelSize = process.env.WHISPER_MODEL_SIZE || "small";
  const computeType = process.env.WHISPER_COMPUTE_TYPE || "int8";
  const device = process.env.WHISPER_DEVICE || "cpu";

  let stdout: string;
  try {
    const result = await execFileAsync(
      pythonPath,
      [scriptPath, audioPath, modelSize, computeType, device],
      { maxBuffer: MAX_BUFFER, timeout: WHISPER_TIMEOUT_MS, env: getChildEnv() },
    );
    stdout = result.stdout;
  } catch (error) {
    const { message, stderr } = readExecError(error);
    throw new Error(
      `Không chuyển được giọng nói thành văn bản (faster-whisper): ${stderr || message}. Kiểm tra ${pythonPath} đã cài faster-whisper chưa.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new Error("faster-whisper trả về dữ liệu không hợp lệ.");
  }

  const parsed = whisperOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("faster-whisper trả về dữ liệu không đúng định dạng mong đợi.");
  }

  return {
    text: parsed.data.text,
    language: parsed.data.language,
    languageProbability: parsed.data.language_probability,
    durationSeconds: parsed.data.duration,
    segments: parsed.data.segments,
  };
}

export async function gatherVideoSource(
  sourceUrl: string,
  platform: VideoPlatform,
): Promise<GatheredVideoSource> {
  const metadata = await fetchVideoMetadata(sourceUrl);

  const maxDurationSeconds = numberFromEnv("VIDEO_MAX_DURATION_SECONDS", 1_200);
  if (metadata.durationSeconds && metadata.durationSeconds > maxDurationSeconds) {
    throw new Error(
      `Video dài khoảng ${Math.round(metadata.durationSeconds / 60)} phút, vượt giới hạn ${Math.round(maxDurationSeconds / 60)} phút cho phân tích video.`,
    );
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "escbase-video-"));
  try {
    const audioPath = await downloadVideoAudio(sourceUrl, tmpDir);
    const transcript = await transcribeAudio(audioPath);

    if (!transcript.text.trim()) {
      throw new Error(
        "Không nhận diện được lời nói trong video này. Video có thể không có giọng nói, chỉ có nhạc, hoặc âm thanh quá nhỏ.",
      );
    }

    return {
      sourceType: "video",
      sourceUrl: metadata.webpageUrl || sourceUrl,
      platform,
      videoId: metadata.videoId,
      title: metadata.title,
      description: metadata.description,
      uploader: metadata.uploader,
      durationSeconds:
        metadata.durationSeconds ??
        (transcript.durationSeconds ? Math.round(transcript.durationSeconds) : null),
      transcript: transcript.text,
      transcriptSegments: transcript.segments,
      language: transcript.language,
    };
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
