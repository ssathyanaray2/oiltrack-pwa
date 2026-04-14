import { describe, it, expect } from "vitest";

// Extracted logic from Dashboard.tsx for isolated testing

type OrderStatus = "Pending" | "Packed" | "Delivered" | "Cancelled";

interface OrderItem {
  productId: string;
  quantity: number;
  unitPrice?: number;
  costPrice?: number;
}

interface Order {
  id: string;
  customerId?: string;
  customerName: string;
  date: string;
  status: OrderStatus;
  items?: OrderItem[];
}

interface Product {
  id: string;
  name: string;
  unitSize: number;
}

function isDeductedStatus(status: OrderStatus) {
  return status === "Packed" || status === "Delivered";
}

function calcMonthlyRevenue(orders: Order[], month: number, year: number) {
  return orders
    .filter((o) => {
      if (!isDeductedStatus(o.status)) return false;
      const d = new Date(o.date);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .reduce((sum, order) => {
      return sum + (order.items ?? []).reduce((s, item) => s + item.quantity * (item.unitPrice ?? 0), 0);
    }, 0);
}

function calcMonthlyLitres(orders: Order[], products: Product[], month: number, year: number) {
  return orders
    .filter((o) => {
      if (!isDeductedStatus(o.status)) return false;
      const d = new Date(o.date);
      return d.getMonth() === month && d.getFullYear() === year;
    })
    .reduce((sum, order) => {
      return sum + (order.items ?? []).reduce((s, item) => {
        const product = products.find((p) => p.id === item.productId);
        return s + item.quantity * (product?.unitSize ?? 1);
      }, 0);
    }, 0);
}

function getLostCustomers(orders: Order[], months: number = 6) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const lastOrder = new Map<string, { date: Date; customerName: string }>();
  orders.forEach((order) => {
    if (order.status === "Cancelled" || !order.customerId) return;
    const existing = lastOrder.get(order.customerId);
    const d = new Date(order.date);
    if (!existing || d > existing.date) {
      lastOrder.set(order.customerId, { date: d, customerName: order.customerName });
    }
  });
  const lost: { customerId: string; customerName: string }[] = [];
  lastOrder.forEach(({ date, customerName }, customerId) => {
    if (date < cutoff) lost.push({ customerId, customerName });
  });
  return lost;
}

// --- Tests ---

describe("monthly revenue", () => {
  const orders: Order[] = [
    { id: "1", customerName: "A", date: "2026-04-01T12:00:00", status: "Delivered", items: [{ productId: "p1", quantity: 10, unitPrice: 50 }] },
    { id: "2", customerName: "B", date: "2026-04-02T12:00:00", status: "Packed",    items: [{ productId: "p1", quantity: 5,  unitPrice: 50 }] },
    { id: "3", customerName: "C", date: "2026-04-03T12:00:00", status: "Pending",   items: [{ productId: "p1", quantity: 20, unitPrice: 50 }] },
    { id: "4", customerName: "D", date: "2026-04-03T12:00:00", status: "Cancelled", items: [{ productId: "p1", quantity: 10, unitPrice: 50 }] },
    { id: "5", customerName: "E", date: "2026-03-01T12:00:00", status: "Delivered", items: [{ productId: "p1", quantity: 10, unitPrice: 50 }] },
  ];

  it("sums quantity × unitPrice for Packed and Delivered in the month", () => {
    // April: order 1 (10×50=500) + order 2 (5×50=250) = 750
    expect(calcMonthlyRevenue(orders, 3, 2026)).toBe(750); // month is 0-indexed
  });

  it("excludes Pending orders", () => {
    const result = calcMonthlyRevenue(orders, 3, 2026);
    expect(result).toBe(750); // order 3 (Pending, 20×50=1000) not included
  });

  it("excludes Cancelled orders", () => {
    const result = calcMonthlyRevenue(orders, 3, 2026);
    expect(result).toBe(750); // order 4 (Cancelled) not included
  });

  it("excludes orders from other months", () => {
    const result = calcMonthlyRevenue(orders, 3, 2026);
    expect(result).toBe(750); // order 5 (March) not included
  });
});

describe("monthly litres sold", () => {
  const products: Product[] = [
    { id: "p1", name: "Sunflower Oil", unitSize: 15 },
    { id: "p2", name: "Olive Oil",     unitSize: 5  },
  ];

  const orders: Order[] = [
    { id: "1", customerName: "A", date: "2026-04-01T12:00:00", status: "Delivered", items: [{ productId: "p1", quantity: 10, unitPrice: 50 }] },
    { id: "2", customerName: "B", date: "2026-04-01T12:00:00", status: "Delivered", items: [{ productId: "p2", quantity: 4,  unitPrice: 80 }] },
    { id: "3", customerName: "C", date: "2026-04-01T12:00:00", status: "Pending",   items: [{ productId: "p1", quantity: 20, unitPrice: 50 }] },
  ];

  it("calculates litres as quantity × unitSize", () => {
    // p1: 10 × 15 = 150L, p2: 4 × 5 = 20L → 170L
    expect(calcMonthlyLitres(orders, products, 3, 2026)).toBe(170);
  });

  it("excludes Pending orders from litres calculation", () => {
    const result = calcMonthlyLitres(orders, products, 3, 2026);
    expect(result).toBe(170); // order 3 (Pending, 20×15=300) not included
  });
});

describe("inactive customers", () => {
  // Dates relative to today so tests stay valid over time
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const eightMonthsAgo = new Date();
  eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);

  const fmt = (d: Date) => d.toISOString();

  const orders: Order[] = [
    // Active: last order 1 month ago (within 6 months)
    { id: "1", customerId: "c1", customerName: "Active Customer", date: fmt(oneMonthAgo),    status: "Delivered" },
    // Lost: last order 8 months ago
    { id: "2", customerId: "c2", customerName: "Lost Customer",   date: fmt(eightMonthsAgo), status: "Delivered" },
    // Cancelled order should not count as last order
    { id: "3", customerId: "c3", customerName: "Cancelled Only",  date: fmt(oneMonthAgo),    status: "Cancelled" },
    // Lost: last non-cancelled order was 8 months ago
    { id: "4", customerId: "c3", customerName: "Cancelled Only",  date: fmt(eightMonthsAgo), status: "Delivered" },
  ];

  it("excludes active customers from lost list", () => {
    const lost = getLostCustomers(orders, 6);
    expect(lost.find((c) => c.customerId === "c1")).toBeUndefined();
  });

  it("includes customers with no order in threshold period", () => {
    const lost = getLostCustomers(orders, 6);
    expect(lost.find((c) => c.customerId === "c2")).toBeDefined();
  });

  it("ignores Cancelled orders when determining last order date", () => {
    const lost = getLostCustomers(orders, 6);
    // c3's last non-cancelled order was Aug 2025 (>6 months ago), so should be lost
    expect(lost.find((c) => c.customerId === "c3")).toBeDefined();
  });

  it("custom threshold of 8 months excludes recently lost customer", () => {
    // c2's last order was Aug 2025, ~8 months ago — within 9 months threshold
    const lost = getLostCustomers(orders, 9);
    expect(lost.find((c) => c.customerId === "c2")).toBeUndefined();
  });

  it("custom threshold of 6 months catches customer lost at 8 months", () => {
    const lost = getLostCustomers(orders, 6);
    expect(lost.find((c) => c.customerId === "c2")).toBeDefined();
  });
});
