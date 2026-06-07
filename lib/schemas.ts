import { z } from "zod";

export const analyzeRequestSchema = z.object({
  url: z
    .url("Hãy nhập một đường dẫn hợp lệ.")
    .max(2048, "Đường dẫn quá dài.")
    .refine((value) => {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    }, "Chỉ hỗ trợ đường dẫn http hoặc https."),
});

export const analysisResultSchema = z.object({
  title: z.string().min(1).max(160),
  subtitle: z.string().min(1).max(260),
  readingMinutes: z.number().int().min(1).max(15),
  overview: z.string().min(1).max(1600),
  mainPoints: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        explanation: z.string().min(1).max(900),
        evidence: z.enum(["author_claim", "supported_by_link", "context"]),
      }),
    )
    .min(1)
    .max(8),
  factsAndFigures: z
    .array(
      z.object({
        value: z.string().min(1).max(100),
        context: z.string().min(1).max(500),
      }),
    )
    .max(12),
  timeline: z
    .array(
      z.object({
        time: z.string().min(1).max(100),
        event: z.string().min(1).max(500),
      }),
    )
    .max(12),
  peopleAndProducts: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        role: z.string().min(1).max(300),
      }),
    )
    .max(12),
  community: z.object({
    available: z.boolean(),
    sentiment: z.enum(["positive", "negative", "mixed", "neutral", "unavailable"]),
    summary: z.string().max(1000),
    highlights: z
      .array(
        z.object({
          author: z.string().min(1).max(100),
          commentary: z.string().min(1).max(500),
          stance: z.enum(["agrees", "disagrees", "questions", "adds_context", "other"]),
        }),
      )
      .max(8),
    repeatedQuestions: z.array(z.string().min(1).max(300)).max(8),
  }),
  linkedSources: z
    .array(
      z.object({
        url: z.string().min(1).max(2048),
        title: z.string().min(1).max(180),
        contribution: z.string().min(1).max(700),
        supports: z.string().min(1).max(500),
      }),
    )
    .max(6),
  caveats: z.array(z.string().min(1).max(500)).max(8),
  takeaway: z.string().min(1).max(1000),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
