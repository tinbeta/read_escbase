#!/usr/bin/env python3
"""CLI bridge so the Next.js app can call faster-whisper from Node.

Usage: python3 transcribe.py <audio_path> [model_size] [compute_type] [device]

Prints a single JSON line to stdout on success:
{
  "language": "vi",
  "language_probability": 0.98,
  "duration": 123.4,
  "text": "...",
  "segments": [{"start": 0.0, "end": 3.2, "text": "..."}]
}

Any diagnostic/progress output must go to stderr so stdout stays valid JSON.
"""

import json
import sys


def fail(message: str) -> None:
    print(json.dumps({"error": message}), file=sys.stderr)
    sys.exit(1)


def main() -> None:
    if len(sys.argv) < 2:
        fail("Thiếu đường dẫn file âm thanh.")

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "small"
    compute_type = sys.argv[3] if len(sys.argv) > 3 else "int8"
    device = sys.argv[4] if len(sys.argv) > 4 else "cpu"

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        fail(
            "Chưa cài faster-whisper trong venv. Chạy: "
            "python3 -m venv .venv && .venv/bin/pip install faster-whisper"
        )
        return

    try:
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
        segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 500},
        )

        text_parts = []
        segment_list = []
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            text_parts.append(text)
            segment_list.append(
                {
                    "start": round(segment.start, 2),
                    "end": round(segment.end, 2),
                    "text": text,
                }
            )

        result = {
            "language": info.language,
            "language_probability": round(info.language_probability, 4)
            if info.language_probability is not None
            else None,
            "duration": round(info.duration, 2) if info.duration else None,
            "text": " ".join(text_parts).strip(),
            "segments": segment_list,
        }
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:  # noqa: BLE001 - surface any failure to Node caller
        fail(f"Lỗi khi transcribe bằng faster-whisper: {error}")


if __name__ == "__main__":
    main()
