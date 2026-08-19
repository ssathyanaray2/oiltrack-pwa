import type { Product, Customer, Order, OrderItem, ProductBatch, Tag } from "./types";
import type { FeatureFlags } from "./featureFlags";
import { defaultFlags } from "./featureFlags";
import { getValidJwt } from "./neonAuth";

export class InsufficientStockError extends Error {
  constructor(public productName: string, public available: number, public requested: number) {
    super(`Insufficient stock for ${productName}: ${available} bottles available, ${requested} requested`);
    this.name = "InsufficientStockError";
  }
}

// ── In-memory session cache ──────────────────────────────────────────────────
// Avoids redundant fetches when navigating between pages in the same
// browser session. Mutations call the matching invalidate function so stale
// data is never served after a write.

const TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry<T> = { data: T; ts: number };
let _productsCache: CacheEntry<Product[]> | null = null;
let _customersCache: CacheEntry<Customer[]> | null = null;
let _featureFlagsCache: CacheEntry<FeatureFlags> | null = null;

function isFresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return entry !== null && Date.now() - entry.ts < TTL_MS;
}

export function invalidateProductsCache(): void { _productsCache = null; }
export function invalidateCustomersCache(): void { _customersCache = null; }

// ── Core fetch helper ────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit): Promise<unknown> {
  const token = await getValidJwt();
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ── Mapper functions ─────────────────────────────────────────────────────────

/** Map DB row to Product (prices now live on product_batches, not products) */
function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    stock: Number(row.quantity),
    unit: String(row.unit),
    lowStockThreshold: Number(row.reorder_threshold),
    unitSize: Number(row.unit_size ?? 1),
  };
}

/** Map DB row to Customer */
function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone ?? ""),
    address: String(row.address ?? ""),
    maps_link: row.maps_link ? String(row.maps_link) : undefined,
    email: row.email ? String(row.email) : undefined,
  };
}

/** Map DB rows to Order (schema: order_date, customer_name, payment_status) */
function mapOrder(
  orderRow: Record<string, unknown>,
  itemRows: Record<string, unknown>[],
  customerName: string,
  tags: Tag[] = []
): Order {
  const firstItem = itemRows[0] ?? null;
  return {
    id: String(orderRow.id),
    customerId: orderRow.customer_id != null ? String(orderRow.customer_id) : "",
    customerName: (orderRow.customer_name != null ? String(orderRow.customer_name) : "") || customerName,
    productId: firstItem?.product_id != null ? String(firstItem.product_id) : "",
    quantity: firstItem ? Number(firstItem.quantity) : 0,
    date: String(orderRow.order_date ?? orderRow.date ?? new Date().toLocaleDateString("en-CA")).slice(0, 10),
    createdAt: orderRow.created_at != null ? String(orderRow.created_at) : undefined,
    status: (orderRow.status as Order["status"]) ?? "Pending",
    paymentStatus: (orderRow.payment_status as Order["paymentStatus"]) ?? "Unpaid",
    paymentMethod: (orderRow.payment_method as Order["paymentMethod"]) ?? undefined,
    amountPaid: orderRow.amount_paid != null ? Number(orderRow.amount_paid) : undefined,
    deliveryDate: orderRow.delivery_date != null ? String(orderRow.delivery_date).slice(0, 10) : undefined,
    deliveryCharge: orderRow.delivery_charge != null ? Number(orderRow.delivery_charge) : undefined,
    notes: orderRow.notes != null ? String(orderRow.notes) : undefined,
    receiptNumber: orderRow.receipt_number != null ? Number(orderRow.receipt_number) : undefined,
    tags,
    items: itemRows.map((item) => ({
      productId: String(item.product_id),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price ?? 0),
      costPrice: Number(item.cost_price ?? 0),
      batchId: item.batch_id ? String(item.batch_id) : undefined,
    })),
  };
}

function mapBatch(row: Record<string, unknown>): ProductBatch {
  return {
    id: String(row.id),
    productId: String(row.product_id),
    batchNumber: String(row.batch_number),
    numberOfBottles: Number(row.number_of_bottles),
    bottleSizeLitres: Number(row.bottle_size_litres),
    unitPrice: Number(row.unit_price ?? 0),
    costPrice: Number(row.cost_price ?? 0),
    quantityLitres: Number(row.quantity_litres ?? 0),
    manufactureDate: row.manufacture_date ? String(row.manufacture_date).slice(0, 10) : null,
    expiryDate: row.expiry_date ? String(row.expiry_date).slice(0, 10) : null,
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

/** Stock is only deducted when an order is Packed or Delivered */
function isStockDeducted(status: Order["status"]): boolean {
  return status === "Packed" || status === "Delivered";
}

// ——— Products ———

export async function getProducts(): Promise<Product[]> {
  if (isFresh(_productsCache)) return _productsCache.data;
  const data = await apiFetch("/api/products") as Record<string, unknown>[];
  const result = data.map(mapProduct);
  _productsCache = { data: result, ts: Date.now() };
  return result;
}

export async function getProduct(id: string): Promise<Product | null> {
  try {
    const data = await apiFetch(`/api/products?id=${id}`) as Record<string, unknown>;
    return data ? mapProduct(data) : null;
  } catch {
    return null;
  }
}

export async function createProduct(input: Omit<Product, "id" | "stock">): Promise<Product> {
  invalidateProductsCache();
  const data = await apiFetch("/api/products", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      unit: input.unit,
      reorder_threshold: input.lowStockThreshold,
      unit_size: input.unitSize ?? 1,
    }),
  }) as Record<string, unknown>;
  return mapProduct(data);
}

export async function updateProduct(
  id: string,
  input: Partial<Omit<Product, "id">>
): Promise<Product> {
  invalidateProductsCache();
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.unit !== undefined) payload.unit = input.unit;
  if (input.lowStockThreshold !== undefined) payload.reorder_threshold = input.lowStockThreshold;
  if (input.unitSize !== undefined) payload.unit_size = input.unitSize;
  const data = await apiFetch(`/api/products?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Record<string, unknown>;
  return mapProduct(data);
}

export async function deleteProduct(id: string): Promise<void> {
  invalidateProductsCache();
  await apiFetch(`/api/products?id=${id}`, { method: "DELETE" });
}

// Note: stock is derived from batch quantity_litres via DB trigger.
// To adjust stock, add/edit/delete batches via createBatch / updateBatch / deleteBatch.

// ——— Customers ———

export async function getCustomers(): Promise<Customer[]> {
  if (isFresh(_customersCache)) return _customersCache.data;
  const data = await apiFetch("/api/customers") as Record<string, unknown>[];
  const result = data.map(mapCustomer);
  _customersCache = { data: result, ts: Date.now() };
  return result;
}

export async function getCustomer(id: string): Promise<Customer | null> {
  try {
    const data = await apiFetch(`/api/customers?id=${id}`) as Record<string, unknown>;
    return data ? mapCustomer(data) : null;
  } catch {
    return null;
  }
}

export async function createCustomer(input: Omit<Customer, "id">): Promise<Customer> {
  invalidateCustomersCache();
  const data = await apiFetch("/api/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      phone: input.phone ?? null,
      address: input.address ?? null,
      email: input.email ?? null,
      maps_link: input.maps_link ?? null,
    }),
  }) as Record<string, unknown>;
  return mapCustomer(data);
}

export async function updateCustomer(
  id: string,
  input: Partial<Omit<Customer, "id">>
): Promise<Customer> {
  invalidateCustomersCache();
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.address !== undefined) payload.address = input.address;
  if (input.email !== undefined) payload.email = input.email ?? null;
  if (input.maps_link !== undefined) payload.maps_link = input.maps_link ?? null;
  const data = await apiFetch(`/api/customers?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Record<string, unknown>;
  return mapCustomer(data);
}

export async function deleteCustomer(id: string): Promise<void> {
  invalidateCustomersCache();
  await apiFetch(`/api/customers?id=${id}`, { method: "DELETE" });
}

// ——— Orders ———

const PAGE_SIZE = 30;

export async function getOrdersPaginated(
  page: number,
  status: "All" | "Pending" | "Packed" | "Delivered" | "Cancelled" = "All",
  sortOrder: "recent" | "oldest" = "recent"
): Promise<{ orders: Order[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    status,
    sort: sortOrder,
  });
  const result = await apiFetch(`/api/orders?${params}`) as { orders: Record<string, unknown>[]; hasMore: boolean };
  const orders = result.orders.map((row) =>
    mapOrder(row, (row.items as Record<string, unknown>[]) ?? [], String(row.customer_name ?? ""), (row.tags as Tag[]) ?? [])
  );
  return { orders, hasMore: result.hasMore };
}

export async function getOrders(): Promise<Order[]> {
  const params = new URLSearchParams({ page: "0", pageSize: "10000", status: "All", sort: "recent" });
  const result = await apiFetch(`/api/orders?${params}`) as { orders: Record<string, unknown>[] };
  return (result.orders ?? []).map((row) =>
    mapOrder(row, (row.items as Record<string, unknown>[]) ?? [], String(row.customer_name ?? ""), (row.tags as Tag[]) ?? [])
  );
}

export async function getCustomerLastOrders(): Promise<{ customerId: string; customerName: string; date: string; status: string }[]> {
  const data = await apiFetch("/api/orders?action=last-orders") as Record<string, unknown>[];
  return data.map((o) => ({
    customerId: String(o.customer_id),
    customerName: String(o.customer_name ?? ""),
    date: String(o.order_date),
    status: String(o.status),
  }));
}

export async function getOrdersSince(since: Date): Promise<Order[]> {
  const sinceStr = since.toISOString().slice(0, 10);
  const data = await apiFetch(`/api/orders?action=since&since=${sinceStr}`) as Record<string, unknown>[];
  return data.map((row) =>
    mapOrder(row, (row.items as Record<string, unknown>[]) ?? [], String(row.customer_name ?? ""), (row.tags as Tag[]) ?? [])
  );
}

export async function getOrderCountsByCustomer(): Promise<Record<string, { total: number; pending: number }>> {
  const data = await apiFetch("/api/orders?action=counts") as Record<string, { total: number; pending: number }>;
  return data;
}

export async function getOrdersByCustomer(customerId: string): Promise<Order[]> {
  const data = await apiFetch(`/api/orders?action=by-customer&customerId=${customerId}`) as Record<string, unknown>[];
  return data.map((row) =>
    mapOrder(row, (row.items as Record<string, unknown>[]) ?? [], String(row.customer_name ?? ""), (row.tags as Tag[]) ?? [])
  );
}

export async function getOrder(id: string): Promise<Order | null> {
  try {
    const row = await apiFetch(`/api/orders?id=${id}`) as Record<string, unknown>;
    return row
      ? mapOrder(row, (row.items as Record<string, unknown>[]) ?? [], String(row.customer_name ?? ""), (row.tags as Tag[]) ?? [])
      : null;
  } catch {
    return null;
  }
}

export async function createOrder(order: {
  customerId: string;
  customerName: string;
  productId: string;
  quantity: number;
  date: string;
  status: Order["status"];
  paymentStatus: Order["paymentStatus"];
  paymentMethod?: Order["paymentMethod"];
  amountPaid?: number;
  deliveryDate?: string;
  deliveryCharge?: number;
  notes?: string;
  items?: Array<{ productId: string; quantity: number; batchId?: string; unitPrice?: number }>;
}): Promise<Order> {
  const itemList = order.items && order.items.length > 0
    ? order.items
    : [{ productId: order.productId, quantity: order.quantity, batchId: undefined as string | undefined, unitPrice: undefined as number | undefined }];

  // Compute total_amount client-side from item unit prices
  const totalAmount = itemList.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0);

  const body = {
    customer_id: order.customerId || null,
    customer_name: order.customerName,
    order_date: order.date,
    status: order.status,
    payment_status: order.paymentStatus,
    payment_method: order.paymentMethod ?? null,
    amount_paid: order.amountPaid ?? 0,
    delivery_date: order.deliveryDate ?? null,
    delivery_charge: order.deliveryCharge ?? 0,
    notes: order.notes ?? null,
    total_amount: totalAmount,
    items: itemList.map((item) => ({
      product_id: item.productId,
      product_name: "",
      quantity: item.quantity,
      unit_price: item.unitPrice ?? 0,
      cost_price: 0,
      batch_id: item.batchId ?? null,
    })),
  };

  const row = await apiFetch("/api/orders", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Record<string, unknown>;

  return mapOrder(row, (row.items as Record<string, unknown>[]) ?? [], String(row.customer_name ?? ""), (row.tags as Tag[]) ?? []);
}

export async function updateOrder(
  id: string,
  input: {
    customerId?: string;
    customerName?: string;
    productId?: string;
    quantity?: number;
    date?: string;
    status?: Order["status"];
    paymentStatus?: Order["paymentStatus"];
    paymentMethod?: Order["paymentMethod"] | null;
    amountPaid?: number;
    deliveryDate?: string | null;
    deliveryCharge?: number;
    notes?: string;
    items?: Array<{ productId: string; quantity: number; batchId?: string; unitPrice?: number }>;
  }
): Promise<Order> {
  const payload: Record<string, unknown> = {};
  if (input.date !== undefined) payload.order_date = input.date;
  if (input.status !== undefined) payload.status = input.status;
  if (input.paymentStatus !== undefined) payload.payment_status = input.paymentStatus;
  if (input.paymentMethod !== undefined) payload.payment_method = input.paymentMethod ?? null;
  if (input.amountPaid !== undefined) payload.amount_paid = input.amountPaid;
  if (input.deliveryDate !== undefined) payload.delivery_date = input.deliveryDate ?? null;
  if (input.deliveryCharge !== undefined) payload.delivery_charge = input.deliveryCharge;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.customerId !== undefined) payload.customer_id = input.customerId;
  if (input.customerName !== undefined) payload.customer_name = input.customerName;

  const newItems = input.items && input.items.length > 0
    ? input.items
    : input.productId !== undefined || input.quantity !== undefined
      ? [{ productId: input.productId!, quantity: input.quantity!, batchId: undefined as string | undefined, unitPrice: undefined as number | undefined }]
      : null;

  if (newItems) {
    payload.total_amount = newItems.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0);
    payload.items = newItems.map((item) => ({
      product_id: item.productId,
      product_name: "",
      quantity: item.quantity,
      unit_price: item.unitPrice ?? 0,
      cost_price: 0,
      batch_id: item.batchId ?? null,
    }));
  }

  const row = await apiFetch(`/api/orders?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Record<string, unknown>;

  return mapOrder(row, (row.items as Record<string, unknown>[]) ?? [], String(row.customer_name ?? ""), (row.tags as Tag[]) ?? []);
}

export async function deleteOrder(id: string): Promise<void> {
  // Restore batch stock client-side before deletion (server doesn't handle this yet)
  const order = await getOrder(id);
  if (order && isStockDeducted(order.status) && order.items?.length) {
    for (const item of order.items) {
      if (item.batchId) {
        const b = await getBatch(item.batchId);
        if (b) await updateBatch(item.batchId, { numberOfBottles: b.numberOfBottles + item.quantity });
      }
    }
  }
  await apiFetch(`/api/orders?id=${id}`, { method: "DELETE" });
}

// ——— Product Batches ———

export async function getBatchesForProduct(productId: string): Promise<ProductBatch[]> {
  const data = await apiFetch(`/api/batches?productId=${productId}`) as Record<string, unknown>[];
  return data.map(mapBatch);
}

export async function getBatch(id: string): Promise<ProductBatch | null> {
  try {
    const data = await apiFetch(`/api/batches?id=${id}`) as Record<string, unknown>;
    return data ? mapBatch(data) : null;
  } catch {
    return null;
  }
}

export async function createBatch(input: {
  productId: string;
  numberOfBottles: number;
  bottleSizeLitres: number;
  unitPrice: number;
  costPrice: number;
  manufactureDate?: string | null;
  expiryDate?: string | null;
  notes?: string;
  batchNumber?: string;
}): Promise<ProductBatch> {
  const quantityLitres = input.numberOfBottles * input.bottleSizeLitres;
  const data = await apiFetch("/api/batches", {
    method: "POST",
    body: JSON.stringify({
      product_id: input.productId,
      batch_number: input.batchNumber ?? "",
      number_of_bottles: input.numberOfBottles,
      bottle_size_litres: input.bottleSizeLitres,
      unit_price: input.unitPrice,
      cost_price: input.costPrice,
      quantity_litres: quantityLitres,
      manufacture_date: input.manufactureDate ?? null,
      expiry_date: input.expiryDate ?? null,
      notes: input.notes ?? null,
    }),
  }) as Record<string, unknown>;
  return mapBatch(data);
}

export async function updateBatch(
  id: string,
  input: Partial<Pick<ProductBatch, "numberOfBottles" | "bottleSizeLitres" | "unitPrice" | "costPrice" | "quantityLitres" | "manufactureDate" | "expiryDate" | "notes">>
): Promise<ProductBatch> {
  const payload: Record<string, unknown> = {};
  if (input.numberOfBottles !== undefined) payload.number_of_bottles = input.numberOfBottles;
  if (input.bottleSizeLitres !== undefined) payload.bottle_size_litres = input.bottleSizeLitres;
  if (input.unitPrice !== undefined) payload.unit_price = input.unitPrice;
  if (input.costPrice !== undefined) payload.cost_price = input.costPrice;
  // Recalculate quantity_litres whenever both bottle fields are present
  if (input.numberOfBottles !== undefined && input.bottleSizeLitres !== undefined) {
    payload.quantity_litres = input.numberOfBottles * input.bottleSizeLitres;
  } else if (input.quantityLitres !== undefined) {
    payload.quantity_litres = input.quantityLitres;
  }
  if (input.manufactureDate !== undefined) payload.manufacture_date = input.manufactureDate ?? null;
  if (input.expiryDate !== undefined) payload.expiry_date = input.expiryDate ?? null;
  if (input.notes !== undefined) payload.notes = input.notes ?? null;
  const data = await apiFetch(`/api/batches?id=${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }) as Record<string, unknown>;
  return mapBatch(data);
}

export async function deleteBatch(id: string): Promise<void> {
  await apiFetch(`/api/batches?id=${id}`, { method: "DELETE" });
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export async function getTags(): Promise<Tag[]> {
  const data = await apiFetch("/api/tags") as Record<string, unknown>[];
  return data.map((r) => ({ id: String(r.id), name: String(r.name), color: String(r.color) }));
}

export async function createTag(name: string, color: string): Promise<Tag> {
  const data = await apiFetch("/api/tags", {
    method: "POST",
    body: JSON.stringify({ name, color }),
  }) as Record<string, unknown>;
  return { id: String(data.id), name: String(data.name), color: String(data.color) };
}

export async function deleteTag(id: string): Promise<void> {
  await apiFetch(`/api/tags?id=${id}`, { method: "DELETE" });
}

export async function assignTagToOrder(orderId: string, tagId: string): Promise<void> {
  await apiFetch("/api/tags?action=assign", {
    method: "POST",
    body: JSON.stringify({ order_id: orderId, tag_id: tagId }),
  });
}

export async function removeTagFromOrder(orderId: string, tagId: string): Promise<void> {
  await apiFetch(`/api/tags?action=remove&orderId=${orderId}&tagId=${tagId}`, { method: "DELETE" });
}

export async function getTagsForOrder(orderId: string): Promise<Tag[]> {
  const data = await apiFetch(`/api/tags?orderId=${orderId}`) as Record<string, unknown>[];
  return data.map((r) => ({ id: String(r.id), name: String(r.name), color: String(r.color) }));
}

// ── Receipts ─────────────────────────────────────────────────────────────────

export async function getNextReceiptNumber(orderDate: string): Promise<number> {
  const data = await apiFetch(`/api/receipts?action=next-number&orderDate=${orderDate}`) as { next_number: number };
  return data.next_number;
}

export async function saveReceiptNumber(orderId: string, receiptNumber: number): Promise<void> {
  await apiFetch(`/api/receipts?id=${orderId}`, {
    method: "PUT",
    body: JSON.stringify({ receipt_number: receiptNumber }),
  });
}

// ── Feature Flags ─────────────────────────────────────────────────────────────

export async function getFeatureFlags(): Promise<FeatureFlags> {
  if (isFresh(_featureFlagsCache)) return _featureFlagsCache.data;
  try {
    const data = await apiFetch("/api/feature-flags") as FeatureFlags;
    const result: FeatureFlags = { ...defaultFlags, ...data };
    _featureFlagsCache = { data: result, ts: Date.now() };
    return result;
  } catch (err) {
    console.error("Failed to fetch feature flags:", err);
    return defaultFlags;
  }
}
