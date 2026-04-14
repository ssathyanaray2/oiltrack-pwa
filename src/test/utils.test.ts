import { describe, it, expect } from "vitest";
import { generateBatchNumber } from "../lib/utils";

describe("generateBatchNumber", () => {
  it("formats correctly for a given date and sequence", () => {
    const date = new Date(2026, 3, 6);
    expect(generateBatchNumber(date, 1)).toBe("BATCH-20260406-001");
  });

  it("zero-pads single digit sequence", () => {
    const date = new Date(2026, 3, 6);
    expect(generateBatchNumber(date, 5)).toBe("BATCH-20260406-005");
  });

  it("zero-pads two digit sequence", () => {
    const date = new Date(2026, 3, 6);
    expect(generateBatchNumber(date, 10)).toBe("BATCH-20260406-010");
  });

  it("handles three digit sequence without padding", () => {
    const date = new Date(2026, 3, 6);
    expect(generateBatchNumber(date, 100)).toBe("BATCH-20260406-100");
  });

  it("uses provided date not today", () => {
    const date = new Date(2025, 0, 15);
    expect(generateBatchNumber(date, 1)).toBe("BATCH-20250115-001");
  });

  it("pads single digit month and day", () => {
    const date = new Date(2026, 2, 5);
    expect(generateBatchNumber(date, 1)).toBe("BATCH-20260305-001");
  });
});
