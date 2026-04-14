import { describe, it, expect } from "vitest";
import { generateBatchNumber } from "../lib/utils";

// Simulates the quantityLitres calculation in updateBatch / createBatch
function calcQuantityLitres(numberOfBottles: number, bottleSizeLitres: number) {
  return numberOfBottles * bottleSizeLitres;
}

// Simulates the partial update payload logic from updateBatch in api.ts
function buildBatchPayload(
  input: {
    numberOfBottles?: number;
    bottleSizeLitres?: number;
    unitPrice?: number;
    costPrice?: number;
    manufactureDate?: string;
    expiryDate?: string;
    notes?: string;
  }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.numberOfBottles !== undefined) payload.number_of_bottles = input.numberOfBottles;
  if (input.bottleSizeLitres !== undefined) payload.bottle_size_litres = input.bottleSizeLitres;
  if (input.unitPrice !== undefined) payload.unit_price = input.unitPrice;
  if (input.costPrice !== undefined) payload.cost_price = input.costPrice;
  if (input.manufactureDate !== undefined) payload.manufacture_date = input.manufactureDate;
  if (input.expiryDate !== undefined) payload.expiry_date = input.expiryDate;
  if (input.notes !== undefined) payload.notes = input.notes;

  // Recalculate quantity_litres when both numberOfBottles and bottleSizeLitres are provided
  if (input.numberOfBottles !== undefined && input.bottleSizeLitres !== undefined) {
    payload.quantity_litres = input.numberOfBottles * input.bottleSizeLitres;
  }

  return payload;
}

describe("batch quantity_litres calculation", () => {
  it("calculates correctly for whole numbers", () => {
    expect(calcQuantityLitres(10, 15)).toBe(150);
  });

  it("calculates correctly for decimal bottle size", () => {
    expect(calcQuantityLitres(5, 0.5)).toBe(2.5);
  });

  it("returns 0 when numberOfBottles is 0", () => {
    expect(calcQuantityLitres(0, 15)).toBe(0);
  });
});

describe("batch number generation (sequence)", () => {
  it("first batch gets sequence 001", () => {
    const date = new Date(2026, 3, 8);
    expect(generateBatchNumber(date, 1)).toBe("BATCH-20260408-001");
  });

  it("second batch same day gets sequence 002", () => {
    const date = new Date(2026, 3, 8);
    expect(generateBatchNumber(date, 2)).toBe("BATCH-20260408-002");
  });

  it("sequence resets per day (different dates produce independent numbers)", () => {
    const day1 = new Date(2026, 3, 8);
    const day2 = new Date(2026, 3, 9);
    expect(generateBatchNumber(day1, 1)).toBe("BATCH-20260408-001");
    expect(generateBatchNumber(day2, 1)).toBe("BATCH-20260409-001");
  });
});

describe("updateBatch partial update payload", () => {
  it("only includes provided fields", () => {
    const payload = buildBatchPayload({ unitPrice: 99 });
    expect(payload).toHaveProperty("unit_price", 99);
    expect(payload).not.toHaveProperty("number_of_bottles");
    expect(payload).not.toHaveProperty("cost_price");
  });

  it("recalculates quantity_litres when both numberOfBottles and bottleSizeLitres provided", () => {
    const payload = buildBatchPayload({ numberOfBottles: 20, bottleSizeLitres: 15 });
    expect(payload.quantity_litres).toBe(300);
  });

  it("does not recalculate quantity_litres when only numberOfBottles provided", () => {
    const payload = buildBatchPayload({ numberOfBottles: 20 });
    expect(payload).not.toHaveProperty("quantity_litres");
  });

  it("does not recalculate quantity_litres when only bottleSizeLitres provided", () => {
    const payload = buildBatchPayload({ bottleSizeLitres: 15 });
    expect(payload).not.toHaveProperty("quantity_litres");
  });

  it("includes all fields when all are provided", () => {
    const payload = buildBatchPayload({
      numberOfBottles: 10,
      bottleSizeLitres: 5,
      unitPrice: 50,
      costPrice: 30,
      notes: "test batch",
    });
    expect(payload).toHaveProperty("number_of_bottles", 10);
    expect(payload).toHaveProperty("bottle_size_litres", 5);
    expect(payload).toHaveProperty("unit_price", 50);
    expect(payload).toHaveProperty("cost_price", 30);
    expect(payload).toHaveProperty("notes", "test batch");
    expect(payload).toHaveProperty("quantity_litres", 50);
  });
});
