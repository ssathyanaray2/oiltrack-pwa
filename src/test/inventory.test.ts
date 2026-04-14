import { describe, it, expect } from "vitest";

// Extracted from Inventory.tsx for isolated testing
function getStockStatus(stock: number, threshold: number) {
  if (stock === 0) return { level: "critical" as const };
  if (stock < threshold) return { level: "low" as const };
  return { level: "normal" as const };
}

type FilterOption = "all" | "low" | "in" | "out";

function applyFilter(
  products: { stock: number; lowStockThreshold: number }[],
  filter: FilterOption
) {
  return products.filter((p) => {
    const status = getStockStatus(p.stock, p.lowStockThreshold);
    if (filter === "low") return status.level === "low" || status.level === "critical";
    if (filter === "in") return status.level === "normal";
    if (filter === "out") return p.stock === 0;
    return true;
  });
}

describe("getStockStatus", () => {
  it("returns critical when stock is 0", () => {
    expect(getStockStatus(0, 10).level).toBe("critical");
  });

  it("returns low when stock is below threshold", () => {
    expect(getStockStatus(5, 10).level).toBe("low");
  });

  it("returns normal when stock equals threshold", () => {
    expect(getStockStatus(10, 10).level).toBe("normal");
  });

  it("returns normal when stock is above threshold", () => {
    expect(getStockStatus(50, 10).level).toBe("normal");
  });

  it("returns low when stock is 1 below threshold", () => {
    expect(getStockStatus(9, 10).level).toBe("low");
  });
});

describe("inventory filter", () => {
  const products = [
    { stock: 0, lowStockThreshold: 10 },   // critical
    { stock: 5, lowStockThreshold: 10 },   // low
    { stock: 10, lowStockThreshold: 10 },  // normal (at threshold)
    { stock: 50, lowStockThreshold: 10 },  // normal
  ];

  it("all filter returns all products", () => {
    expect(applyFilter(products, "all")).toHaveLength(4);
  });

  it("low filter returns both critical and low", () => {
    const result = applyFilter(products, "low");
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.stock)).toContain(0);
    expect(result.map((p) => p.stock)).toContain(5);
  });

  it("out filter returns only stock === 0", () => {
    const result = applyFilter(products, "out");
    expect(result).toHaveLength(1);
    expect(result[0].stock).toBe(0);
  });

  it("in filter returns only normal stock", () => {
    const result = applyFilter(products, "in");
    expect(result).toHaveLength(2);
    result.forEach((p) => expect(p.stock).toBeGreaterThanOrEqual(p.lowStockThreshold));
  });
});
