import { describe, expect, it } from "vitest";
import {
  extractAnalysisId,
  getAnalysisPath,
  slugifyTitle,
} from "./share-url";

describe("share URL", () => {
  it("creates a readable Vietnamese path with the analysis id", () => {
    expect(
      getAnalysisPath(
        "David Cramer muốn bỏ kiểu sắp xếp theo project trong Codex",
        "76b54430a9aa",
      ),
    ).toBe(
      "/david-cramer-muon-bo-kieu-sap-xep-theo-project-trong-codex-76b54430a9aa",
    );
  });

  it("extracts the analysis id from a readable path", () => {
    expect(
      extractAnalysisId(
        "david-cramer-muon-bo-kieu-sap-xep-theo-project-trong-codex-76b54430a9aa",
      ),
    ).toBe("76b54430a9aa");
  });

  it("falls back when the title has no URL-safe characters", () => {
    expect(slugifyTitle("🎉")).toBe("bai-viet");
  });
});
