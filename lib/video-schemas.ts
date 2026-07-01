import { z } from "zod";

export const videoClaimVerdictSchema = z.enum([
  "accurate",
  "inaccurate",
  "misleading",
  "needs_context",
  "unverifiable",
  "opinion",
]);

export const videoOverallVerdictSchema = z.enum([
  "mostly_accurate",
  "mixed",
  "mostly_inaccurate",
  "unverifiable",
  "opinion_no_factual_claims",
]);

export const videoSourceRefSchema = z.object({
  title: z.string().min(1).max(220),
  url: z.string().min(1).max(2048),
  publisher: z.string().max(140).optional(),
});

export const videoClaimSchema = z.object({
  claim: z.string().min(1).max(400),
  verdict: videoClaimVerdictSchema,
  explanation: z.string().min(1).max(700),
  sources: z.array(videoSourceRefSchema).max(4),
});

export const videoFactCheckSchema = z.object({
  overallVerdict: videoOverallVerdictSchema,
  summary: z.string().min(1).max(800),
  claims: z.array(videoClaimSchema).max(8),
  sources: z.array(videoSourceRefSchema).max(10),
  caveats: z.array(z.string().min(1).max(400)).max(6),
});

// What the model itself is responsible for producing. Fields the app already
// knows deterministically from yt-dlp/whisper (platform, duration, language)
// are intentionally excluded here and merged in afterwards, so the model
// can't drift/hallucinate metadata that the pipeline already has for free.
export const videoModelOutputSchema = z.object({
  title: z.string().min(1).max(160),
  subtitle: z.string().min(1).max(260),
  summary: z.object({
    overview: z.string().min(1).max(1600),
    mainPoints: z
      .array(
        z.object({
          title: z.string().min(1).max(120),
          explanation: z.string().min(1).max(500),
        }),
      )
      .min(1)
      .max(8),
    keyQuotes: z.array(z.string().min(1).max(300)).max(5),
  }),
  factCheck: videoFactCheckSchema,
});

export const videoAnalysisResultSchema = videoModelOutputSchema.extend({
  platform: z.enum(["youtube", "tiktok", "facebook"]),
  durationSeconds: z.number().int().min(0).nullable(),
  language: z.string().max(20).nullable(),
});

export type VideoClaim = z.infer<typeof videoClaimSchema>;
export type VideoModelOutput = z.infer<typeof videoModelOutputSchema>;
export type VideoAnalysisResult = z.infer<typeof videoAnalysisResultSchema>;
