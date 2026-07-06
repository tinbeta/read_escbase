import "server-only";

import { tool } from "@openai/agents";
import { z } from "zod";
import { localWebSearch } from "@/lib/local-web-search";

const localWebSearchInputSchema = z.object({
  query: z
    .string()
    .min(3)
    .max(300)
    .describe("Truy vấn tìm kiếm ngắn, cụ thể, không kèm hướng dẫn dài."),
  allowedDomains: z
    .array(z.string().min(1).max(160))
    .max(20)
    .optional()
    .describe("Chỉ tìm trong các domain này, ví dụ cdc.gov hoặc reuters.com."),
  blockedDomains: z
    .array(z.string().min(1).max(160))
    .max(50)
    .optional()
    .describe("Loại bỏ các domain kém phù hợp như mạng xã hội, forum hoặc nguồn nhiễu."),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(8)
    .optional()
    .describe("Số nguồn tối đa cần trả về. Mặc định là 5."),
});

export function localWebSearchTool() {
  return tool({
    name: "local_web_search",
    description:
      "Tìm kiếm web bằng search provider do app tự quản lý, đọc các trang kết quả và trả về nguồn thật kèm title, URL, publisher, snippet và đoạn text ngắn để kiểm chứng.",
    parameters: localWebSearchInputSchema,
    strict: true,
    timeoutMs: 45_000,
    timeoutBehavior: "error_as_result",
    execute: async (input) => localWebSearch(input),
    errorFunction: (_context, error) => {
      const message = error instanceof Error ? error.message : "Không thể chạy local web search.";
      return JSON.stringify({
        query: "",
        provider: "none",
        cached: false,
        generatedAt: new Date().toISOString(),
        results: [],
        errors: [message],
      });
    },
  });
}
