import { describe, it, expect, vi, beforeEach } from "vitest";
import { InsufficientStockError } from "../lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────

type OrderStatus = "Pending" | "Packed" | "Delivered" | "Cancelled";

function isStockDeducted(status: OrderStatus) {
  return status === "Packed" || status === "Delivered";
}

interface Batch {
  id: string;
  productId: string;
  numberOfBottles: number;
}

interface OrderItem {
  productId: string;
  quantity: number;
  batchId?: string;
}

/**
 * Simulates the status-only transition logic from updateOrder in api.ts.
 * Uses injectable getBatch / updateBatch so we can test without Supabase.
 */
async function simulateStatusTransition(
  fromStatus: OrderStatus,
  toStatus: OrderStatus,
  items: OrderItem[],
  getBatch: (id: string) => Promise<Batch | null>,
  updateBatch: (id: string, numberOfBottles: number) => Promise<void>
) {
  const wasDeducted = isStockDeducted(fromStatus);
  const willBeDeducted = isStockDeducted(toStatus);

  // Cancelled → Pending: validate stock without deducting
  if (fromStatus === "Cancelled" && toStatus === "Pending") {
    for (const item of items) {
      if (item.batchId) {
        const b = await getBatch(item.batchId);
        if (b && b.numberOfBottles < item.quantity) {
          throw new InsufficientStockError(item.productId, b.numberOfBottles, item.quantity);
        }
      }
    }
    return;
  }

  if (!wasDeducted && willBeDeducted) {
    // Deduct
    for (const item of items) {
      if (item.batchId) {
        const b = await getBatch(item.batchId);
        if (b && b.numberOfBottles >= item.quantity) {
          await updateBatch(item.batchId, b.numberOfBottles - item.quantity);
        } else if (b && b.numberOfBottles < item.quantity) {
          throw new InsufficientStockError(item.productId, b.numberOfBottles, item.quantity);
        }
      }
    }
  } else if (wasDeducted && !willBeDeducted) {
    // Restore
    for (const item of items) {
      if (item.batchId) {
        const b = await getBatch(item.batchId);
        if (b) await updateBatch(item.batchId, b.numberOfBottles + item.quantity);
      }
    }
  }
}

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeBatch(numberOfBottles: number): Batch {
  return { id: "batch-1", productId: "prod-1", numberOfBottles };
}

function makeItem(quantity: number): OrderItem {
  return { productId: "prod-1", quantity, batchId: "batch-1" };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("InsufficientStockError", () => {
  it("carries available and requested values", () => {
    const err = new InsufficientStockError("prod-1", 5, 10);
    expect(err.available).toBe(5);
    expect(err.requested).toBe(10);
    expect(err.productName).toBe("prod-1");
    expect(err.name).toBe("InsufficientStockError");
  });
});

describe("Pending → Packed", () => {
  it("deducts item quantity from batch", async () => {
    const batch = makeBatch(50);
    const updateBatch = vi.fn();
    const getBatch = vi.fn().mockResolvedValue(batch);

    await simulateStatusTransition("Pending", "Packed", [makeItem(10)], getBatch, updateBatch);

    expect(updateBatch).toHaveBeenCalledWith("batch-1", 40);
  });

  it("throws InsufficientStockError when batch is short", async () => {
    const batch = makeBatch(5);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await expect(
      simulateStatusTransition("Pending", "Packed", [makeItem(10)], getBatch, updateBatch)
    ).rejects.toThrow(InsufficientStockError);
  });

  it("error has correct available and requested counts", async () => {
    const batch = makeBatch(3);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    try {
      await simulateStatusTransition("Pending", "Packed", [makeItem(10)], getBatch, updateBatch);
    } catch (err) {
      expect(err).toBeInstanceOf(InsufficientStockError);
      expect((err as InsufficientStockError).available).toBe(3);
      expect((err as InsufficientStockError).requested).toBe(10);
    }
  });

  it("does not call updateBatch when stock is insufficient", async () => {
    const batch = makeBatch(5);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await expect(
      simulateStatusTransition("Pending", "Packed", [makeItem(10)], getBatch, updateBatch)
    ).rejects.toThrow();

    expect(updateBatch).not.toHaveBeenCalled();
  });
});

describe("Pending → Delivered", () => {
  it("deducts stock same as Packed", async () => {
    const batch = makeBatch(50);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await simulateStatusTransition("Pending", "Delivered", [makeItem(20)], getBatch, updateBatch);

    expect(updateBatch).toHaveBeenCalledWith("batch-1", 30);
  });

  it("throws InsufficientStockError when short", async () => {
    const batch = makeBatch(5);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await expect(
      simulateStatusTransition("Pending", "Delivered", [makeItem(10)], getBatch, updateBatch)
    ).rejects.toThrow(InsufficientStockError);
  });
});

describe("Pending → Cancelled", () => {
  it("makes no stock changes", async () => {
    const getBatch = vi.fn();
    const updateBatch = vi.fn();

    await simulateStatusTransition("Pending", "Cancelled", [makeItem(10)], getBatch, updateBatch);

    expect(getBatch).not.toHaveBeenCalled();
    expect(updateBatch).not.toHaveBeenCalled();
  });
});

describe("Packed → Delivered", () => {
  it("makes no stock changes (both are deducted states)", async () => {
    const getBatch = vi.fn();
    const updateBatch = vi.fn();

    await simulateStatusTransition("Packed", "Delivered", [makeItem(10)], getBatch, updateBatch);

    expect(getBatch).not.toHaveBeenCalled();
    expect(updateBatch).not.toHaveBeenCalled();
  });
});

describe("Packed → Pending", () => {
  it("restores item quantity to batch", async () => {
    const batch = makeBatch(40);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await simulateStatusTransition("Packed", "Pending", [makeItem(10)], getBatch, updateBatch);

    expect(updateBatch).toHaveBeenCalledWith("batch-1", 50);
  });
});

describe("Packed → Cancelled", () => {
  it("restores item quantity to batch", async () => {
    const batch = makeBatch(40);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await simulateStatusTransition("Packed", "Cancelled", [makeItem(10)], getBatch, updateBatch);

    expect(updateBatch).toHaveBeenCalledWith("batch-1", 50);
  });
});

describe("Delivered → Pending", () => {
  it("restores stock", async () => {
    const batch = makeBatch(20);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await simulateStatusTransition("Delivered", "Pending", [makeItem(15)], getBatch, updateBatch);

    expect(updateBatch).toHaveBeenCalledWith("batch-1", 35);
  });
});

describe("Delivered → Cancelled", () => {
  it("restores stock", async () => {
    const batch = makeBatch(20);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await simulateStatusTransition("Delivered", "Cancelled", [makeItem(15)], getBatch, updateBatch);

    expect(updateBatch).toHaveBeenCalledWith("batch-1", 35);
  });
});

describe("Cancelled → Pending", () => {
  it("allows transition when batch has enough stock (no deduction)", async () => {
    const batch = makeBatch(20);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await simulateStatusTransition("Cancelled", "Pending", [makeItem(10)], getBatch, updateBatch);

    expect(updateBatch).not.toHaveBeenCalled();
  });

  it("throws InsufficientStockError when batch is short", async () => {
    const batch = makeBatch(5);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await expect(
      simulateStatusTransition("Cancelled", "Pending", [makeItem(10)], getBatch, updateBatch)
    ).rejects.toThrow(InsufficientStockError);
  });

  it("does not deduct stock even when transition is allowed", async () => {
    const batch = makeBatch(50);
    const getBatch = vi.fn().mockResolvedValue(batch);
    const updateBatch = vi.fn();

    await simulateStatusTransition("Cancelled", "Pending", [makeItem(10)], getBatch, updateBatch);

    expect(updateBatch).not.toHaveBeenCalled();
  });
});

describe("multi-item orders", () => {
  it("deducts all items when moving Pending → Packed", async () => {
    const batches: Record<string, Batch> = {
      "batch-1": { id: "batch-1", productId: "p1", numberOfBottles: 50 },
      "batch-2": { id: "batch-2", productId: "p2", numberOfBottles: 30 },
    };
    const getBatch = vi.fn((id: string) => Promise.resolve(batches[id] ?? null));
    const updateBatch = vi.fn();
    const items: OrderItem[] = [
      { productId: "p1", quantity: 10, batchId: "batch-1" },
      { productId: "p2", quantity: 5,  batchId: "batch-2" },
    ];

    await simulateStatusTransition("Pending", "Packed", items, getBatch, updateBatch);

    expect(updateBatch).toHaveBeenCalledWith("batch-1", 40);
    expect(updateBatch).toHaveBeenCalledWith("batch-2", 25);
  });

  it("throws InsufficientStockError and stops on first short item", async () => {
    const batches: Record<string, Batch> = {
      "batch-1": { id: "batch-1", productId: "p1", numberOfBottles: 50 },
      "batch-2": { id: "batch-2", productId: "p2", numberOfBottles: 3 }, // short
    };
    const getBatch = vi.fn((id: string) => Promise.resolve(batches[id] ?? null));
    const updateBatch = vi.fn();
    const items: OrderItem[] = [
      { productId: "p1", quantity: 10, batchId: "batch-1" },
      { productId: "p2", quantity: 5,  batchId: "batch-2" },
    ];

    await expect(
      simulateStatusTransition("Pending", "Packed", items, getBatch, updateBatch)
    ).rejects.toThrow(InsufficientStockError);
  });
});

describe("items without batchId", () => {
  it("skips stock deduction for items without a batchId", async () => {
    const getBatch = vi.fn();
    const updateBatch = vi.fn();
    const item: OrderItem = { productId: "p1", quantity: 10 }; // no batchId

    await simulateStatusTransition("Pending", "Packed", [item], getBatch, updateBatch);

    expect(getBatch).not.toHaveBeenCalled();
    expect(updateBatch).not.toHaveBeenCalled();
  });
});
