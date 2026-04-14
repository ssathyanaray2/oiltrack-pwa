import { supabase, isSupabaseConfigured } from "./supabase";
import type { Product, Customer, Order, OrderItem, ProductBatch } from "./types";
import type { FeatureFlags } from "./featureFlags";
import { defaultFlags } from "./featureFlags";
import { generateBatchNumber } from "./utils";

export class InsufficientStockError extends Error {
  constructor(public productName: string, public available: number, public requested: number) {
    super(`Insufficient stock for ${productName}: ${available} bottles available, ${requested} requested`);
    this.name = "InsufficientStockError";
  }
}

async function getCurrentUserId(): Promise<string> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

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

/** Map DB row to Customer (schema has no email unless you add it) */
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
  customerName: string
): Order {
  const firstItem = itemRows[0] ?? null;
  return {
    id: String(orderRow.id),
    customerId: orderRow.customer_id != null ? String(orderRow.customer_id) : "",
    customerName: (orderRow.customer_name != null ? String(orderRow.customer_name) : "") || customerName,
    productId: firstItem?.product_id != null ? String(firstItem.product_id) : "",
    quantity: firstItem ? Number(firstItem.quantity) : 0,
    date: String(orderRow.order_date ?? orderRow.date ?? new Date().toLocaleDateString("en-CA")),
    createdAt: orderRow.created_at != null ? String(orderRow.created_at) : undefined,
    status: (orderRow.status as Order["status"]) ?? "Pending",
    paymentStatus: (orderRow.payment_status as Order["paymentStatus"]) ?? "Unpaid",
    paymentMethod: (orderRow.payment_method as Order["paymentMethod"]) ?? undefined,
    notes: orderRow.notes != null ? String(orderRow.notes) : undefined,
    items: itemRows.map((item) => ({
      productId: String(item.product_id),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price ?? 0),
      costPrice: Number(item.cost_price ?? 0),
      batchId: item.batch_id ? String(item.batch_id) : undefined,
    })),
  };
}

function mapOrderItem(row: Record<string, unknown>): OrderItem {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    productId: String(row.product_id),
    quantity: Number(row.quantity),
  };
}

// ——— Products ———

export async function getProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.from("products").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map(mapProduct);
}

export async function getProduct(id: string): Promise<Product | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data ? mapProduct(data) : null;
}

export async function createProduct(input: Omit<Product, "id" | "stock">): Promise<Product> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name,
      quantity: 0,
      unit: input.unit,
      reorder_threshold: input.lowStockThreshold,
      unit_size: input.unitSize ?? 1,
      user_id: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapProduct(data);
}

export async function updateProduct(
  id: string,
  input: Partial<Omit<Product, "id">>
): Promise<Product> {
  const userId = await getCurrentUserId();
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.unit !== undefined) payload.unit = input.unit;
  if (input.lowStockThreshold !== undefined) payload.reorder_threshold = input.lowStockThreshold;
  if (input.unitSize !== undefined) payload.unit_size = input.unitSize;
  const { data, error } = await supabase!.from("products").update(payload).eq("id", id).eq("user_id", userId).select().single();
  if (error) throw error;
  return mapProduct(data);
}

export async function deleteProduct(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase!.from("products").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

// Note: stock is now derived from batch quantity_litres via DB trigger.
// To adjust stock, add/edit/delete batches via createBatch / updateBatch / deleteBatch.

// ——— Customers ———

export async function getCustomers(): Promise<Customer[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase.from("customers").select("*").order("name");
  if (error) throw error;
  return (data ?? []).map(mapCustomer);
}

export async function getCustomer(id: string): Promise<Customer | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data ? mapCustomer(data) : null;
}

export async function createCustomer(input: Omit<Customer, "id">): Promise<Customer> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: input.name,
      phone: input.phone ?? null,
      address: input.address ?? null,
      email: input.email ?? null,
      maps_link: input.maps_link ?? null,
      user_id: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapCustomer(data);
}

export async function updateCustomer(
  id: string,
  input: Partial<Omit<Customer, "id">>
): Promise<Customer> {
  const userId = await getCurrentUserId();
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.address !== undefined) payload.address = input.address;
  if (input.email !== undefined) payload.email = input.email ?? null;
  if (input.maps_link !== undefined) payload.maps_link = input.maps_link ?? null;
  const { data, error } = await supabase!.from("customers").update(payload).eq("id", id).eq("user_id", userId).select().single();
  if (error) throw error;
  return mapCustomer(data);
}

export async function deleteCustomer(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase!.from("customers").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

/** Stock is only deducted when an order is Packed or Delivered */
function isStockDeducted(status: Order["status"]): boolean {
  return status === "Packed" || status === "Delivered";
}

// ——— Orders (with order_items: one item per order for current UI) ———

export async function getOrders(): Promise<Order[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (ordersError) throw ordersError;
  if (!ordersData?.length) return [];

  const orderIds = ordersData.map((o) => o.id);
  const { data: itemsData, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);
  if (itemsError) throw itemsError;

  const customerIds = [...new Set(ordersData.map((o) => o.customer_id).filter(Boolean))];
  const customerMap = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customersData } = await supabase.from("customers").select("id, name").in("id", customerIds);
    (customersData ?? []).forEach((c) => customerMap.set(c.id, c.name));
  }

  const itemsByOrder = new Map<string, (typeof itemsData)[0][]>();
  for (const item of itemsData ?? []) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id)!.push(item);
  }

  return ordersData.map((o) => {
    const customerName = o.customer_name ?? customerMap.get(o.customer_id) ?? "";
    return mapOrder(o, itemsByOrder.get(o.id) ?? [], customerName);
  });
}

export async function getCustomerLastOrders(): Promise<{ customerId: string; customerName: string; date: string; status: string }[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("orders")
    .select("customer_id, customer_name, order_date, status")
    .not("customer_id", "is", null);
  if (error) throw error;
  return (data ?? []).map((o) => ({
    customerId: o.customer_id,
    customerName: o.customer_name ?? "",
    date: o.order_date,
    status: o.status,
  }));
}

export async function getOrdersSince(since: Date): Promise<Order[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const sinceStr = since.toISOString().slice(0, 10);
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .gte("order_date", sinceStr)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (ordersError) throw ordersError;
  if (!ordersData?.length) return [];

  const orderIds = ordersData.map((o) => o.id);
  const { data: itemsData, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);
  if (itemsError) throw itemsError;

  const customerIds = [...new Set(ordersData.map((o) => o.customer_id).filter(Boolean))];
  const customerMap = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: customersData } = await supabase.from("customers").select("id, name").in("id", customerIds);
    (customersData ?? []).forEach((c) => customerMap.set(c.id, c.name));
  }

  const itemsByOrder = new Map<string, (typeof itemsData)[0][]>();
  for (const item of itemsData ?? []) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id)!.push(item);
  }

  return ordersData.map((o) => {
    const customerName = o.customer_name ?? customerMap.get(o.customer_id) ?? "";
    return mapOrder(o, itemsByOrder.get(o.id) ?? [], customerName);
  });
}

export async function getOrderCountsByCustomer(): Promise<Record<string, { total: number; pending: number }>> {
  if (!isSupabaseConfigured() || !supabase) return {};
  const { data, error } = await supabase
    .from("orders")
    .select("customer_id, status");
  if (error) throw error;
  const counts: Record<string, { total: number; pending: number }> = {};
  for (const row of data ?? []) {
    if (!row.customer_id) continue;
    if (!counts[row.customer_id]) counts[row.customer_id] = { total: 0, pending: 0 };
    counts[row.customer_id].total++;
    if (row.status === "Pending") counts[row.customer_id].pending++;
  }
  return counts;
}

export async function getOrdersByCustomer(customerId: string): Promise<Order[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (ordersError) throw ordersError;
  if (!ordersData?.length) return [];

  const orderIds = ordersData.map((o) => o.id);
  const { data: itemsData, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);
  if (itemsError) throw itemsError;

  const itemsByOrder = new Map<string, (typeof itemsData)[0][]>();
  for (const item of itemsData ?? []) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id)!.push(item);
  }

  const customerName = ordersData[0]?.customer_name ?? "";
  return ordersData.map((o) => mapOrder(o, itemsByOrder.get(o.id) ?? [], o.customer_name ?? customerName));
}

export async function getOrder(id: string): Promise<Order | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();
  if (orderError) {
    if (orderError.code === "PGRST116") return null;
    throw orderError;
  }
  const { data: itemsData } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id);
  const items = itemsData ?? [];
  const customerName = orderData.customer_name ?? "";
  const nameFromCust = orderData.customer_id
    ? (await supabase.from("customers").select("name").eq("id", orderData.customer_id).single()).data?.name
    : null;
  return mapOrder(orderData, items, customerName || nameFromCust || "");
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
  notes?: string;
  items?: Array<{ productId: string; quantity: number; batchId?: string }>;
}): Promise<Order> {
  if (!supabase) throw new Error("Supabase not configured");

  const itemList = order.items && order.items.length > 0
    ? order.items
    : [{ productId: order.productId, quantity: order.quantity, batchId: undefined }];

  // Load product names and batch prices
  const productNameMap = new Map<string, string>();
  const batchMap = new Map<string, ProductBatch>();
  for (const item of itemList) {
    if (!productNameMap.has(item.productId)) {
      const p = await getProduct(item.productId);
      if (p) productNameMap.set(item.productId, p.name);
    }
    if (item.batchId && !batchMap.has(item.batchId)) {
      const b = await getBatch(item.batchId);
      if (b) batchMap.set(item.batchId, b);
    }
  }

  const totalAmount = itemList.reduce((sum, item) => {
    const b = item.batchId ? batchMap.get(item.batchId) : null;
    return sum + item.quantity * (b?.unitPrice ?? 0);
  }, 0);

  const { data: { user } } = await supabase.auth.getUser();
  const orderPayload: Record<string, unknown> = {
    customer_id: order.customerId || null,
    customer_name: order.customerName,
    order_date: order.date,
    status: order.status,
    total_amount: totalAmount,
    notes: order.notes ?? null,
    user_id: user?.id ?? null,
  };
  if (order.paymentStatus != null) orderPayload.payment_status = order.paymentStatus;
  orderPayload.payment_method = order.paymentMethod ?? null;

  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .insert(orderPayload)
    .select()
    .single();
  if (orderError) throw orderError;

  for (const item of itemList) {
    const b = item.batchId ? batchMap.get(item.batchId) : null;
    const { error: itemError } = await supabase.from("order_items").insert({
      order_id: orderRow.id,
      product_id: item.productId,
      product_name: productNameMap.get(item.productId) ?? "",
      quantity: item.quantity,
      unit_price: b?.unitPrice ?? 0,
      cost_price: b?.costPrice ?? 0,
      batch_id: item.batchId ?? null,
    });
    if (itemError) throw itemError;
  }

  // Deduct from batch number_of_bottles — trigger auto-syncs products.quantity
  if (isStockDeducted(order.status)) {
    for (const item of itemList) {
      if (item.batchId) {
        const b = batchMap.get(item.batchId) ?? await getBatch(item.batchId);
        if (b && b.numberOfBottles >= item.quantity) {
          await updateBatch(item.batchId, { numberOfBottles: b.numberOfBottles - item.quantity });
        } else if (b && b.numberOfBottles < item.quantity) {
          throw new InsufficientStockError(item.productId, b.numberOfBottles, item.quantity);
        }
      }
    }
  }

  return getOrder(orderRow.id) as Promise<Order>;
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
    notes?: string;
    items?: Array<{ productId: string; quantity: number; batchId?: string }>;
  }
): Promise<Order> {
  if (!supabase) throw new Error("Supabase not configured");

  const existing = await getOrder(id);
  if (!existing) throw new Error("Order not found");

  const orderPayload: Record<string, unknown> = {};
  if (input.date !== undefined) orderPayload.order_date = input.date;
  if (input.status !== undefined) orderPayload.status = input.status;
  if (input.paymentStatus !== undefined) orderPayload.payment_status = input.paymentStatus;
  if (input.paymentMethod !== undefined) orderPayload.payment_method = input.paymentMethod ?? null;
  if (input.notes !== undefined) orderPayload.notes = input.notes;
  if (input.customerId !== undefined) orderPayload.customer_id = input.customerId;
  if (input.customerName !== undefined) orderPayload.customer_name = input.customerName;

  const newItems = input.items && input.items.length > 0
    ? input.items
    : input.productId !== undefined || input.quantity !== undefined
      ? [{ productId: input.productId ?? existing.productId, quantity: input.quantity ?? existing.quantity, batchId: undefined as string | undefined }]
      : null;

  if (newItems) {
    // Restore batch stock for existing items (only if stock was previously deducted)
    if (isStockDeducted(existing.status) && existing.items?.length) {
      for (const item of existing.items) {
        if (item.batchId) {
          const b = await getBatch(item.batchId);
          if (b) await updateBatch(item.batchId, { numberOfBottles: b.numberOfBottles + item.quantity });
        }
      }
    }

    // Load new batch prices and product names
    const newBatchMap = new Map<string, ProductBatch>();
    const productNameMap = new Map<string, string>();
    for (const item of newItems) {
      if (!productNameMap.has(item.productId)) {
        const p = await getProduct(item.productId);
        if (p) productNameMap.set(item.productId, p.name);
      }
      if (item.batchId && !newBatchMap.has(item.batchId)) {
        const b = await getBatch(item.batchId);
        if (b) newBatchMap.set(item.batchId, b);
      }
    }
    orderPayload.total_amount = newItems.reduce((sum, item) => {
      const b = item.batchId ? newBatchMap.get(item.batchId) : null;
      return sum + item.quantity * (b?.unitPrice ?? 0);
    }, 0);

    // Replace all order items
    await supabase.from("order_items").delete().eq("order_id", id);
    for (const item of newItems) {
      const b = item.batchId ? newBatchMap.get(item.batchId) : null;
      await supabase.from("order_items").insert({
        order_id: id,
        product_id: item.productId,
        product_name: productNameMap.get(item.productId) ?? "",
        quantity: item.quantity,
        unit_price: b?.unitPrice ?? 0,
        cost_price: b?.costPrice ?? 0,
        batch_id: item.batchId ?? null,
      });
    }

    // Deduct from new batches (only if new status has stock deducted)
    const newStatus = input.status ?? existing.status;
    if (isStockDeducted(newStatus)) {
      for (const item of newItems) {
        if (item.batchId) {
          const b = newBatchMap.get(item.batchId) ?? await getBatch(item.batchId);
          if (b) await updateBatch(item.batchId, { numberOfBottles: Math.max(0, b.numberOfBottles - item.quantity) });
        }
      }
    }
  }

  // Handle status-only changes (no item changes)
  if (!newItems && input.status !== undefined && input.status !== existing.status) {
    const wasDeducted = isStockDeducted(existing.status);
    const willBeDeducted = isStockDeducted(input.status);

    // Cancelled → Pending: validate stock without deducting
    if (existing.status === "Cancelled" && input.status === "Pending" && existing.items?.length) {
      for (const item of existing.items) {
        if (item.batchId) {
          const b = await getBatch(item.batchId);
          if (b && b.numberOfBottles < item.quantity) {
            throw new InsufficientStockError(item.productId ?? "Product", b.numberOfBottles, item.quantity);
          }
        }
      }
    }

    if (!wasDeducted && willBeDeducted && existing.items?.length) {
      // e.g. Pending → Packed: deduct from batch
      for (const item of existing.items) {
        if (item.batchId) {
          const b = await getBatch(item.batchId);
          if (b && b.numberOfBottles >= item.quantity) {
            await updateBatch(item.batchId, { numberOfBottles: b.numberOfBottles - item.quantity });
          } else if (b && b.numberOfBottles < item.quantity) {
            throw new InsufficientStockError(item.productId ?? "Product", b.numberOfBottles, item.quantity);
          }
        }
      }
    } else if (wasDeducted && !willBeDeducted && existing.items?.length) {
      // e.g. Packed → Cancelled or Packed → Pending: restore batch
      for (const item of existing.items) {
        if (item.batchId) {
          const b = await getBatch(item.batchId);
          if (b) await updateBatch(item.batchId, { numberOfBottles: b.numberOfBottles + item.quantity });
        }
      }
    }
  }

  if (Object.keys(orderPayload).length > 0) {
    const userId = await getCurrentUserId();
    const { error } = await supabase!.from("orders").update(orderPayload).eq("id", id).eq("user_id", userId);
    if (error) throw error;
  }

  return getOrder(id) as Promise<Order>;
}

export async function deleteOrder(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const order = await getOrder(id);
  if (order && isStockDeducted(order.status) && order.items?.length) {
    for (const item of order.items) {
      if (item.batchId) {
        const b = await getBatch(item.batchId);
        if (b) await updateBatch(item.batchId, { numberOfBottles: b.numberOfBottles + item.quantity });
      }
    }
  }
  await supabase!.from("order_items").delete().eq("order_id", id);
  const { error } = await supabase!.from("orders").delete().eq("id", id).eq("user_id", userId);
  if (error) throw error;
}

// ——— Order items (for future multi-line orders) ———

export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);
  if (error) throw error;
  return (data ?? []).map(mapOrderItem);
}



export async function updateProductUnitSize(id: string, unitSize: number): Promise<Product> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase!.from('products').update({ unit_size: unitSize })
    .eq('id', id).eq('user_id', userId).select().single();
  if (error) throw error;
  return mapProduct(data);
}

export async function updateProductReorderThreshold(id: string, threshold: number): Promise<Product> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase!.from('products').update({ reorder_threshold: threshold })
    .eq('id', id).eq('user_id', userId).select().single();
  if (error) throw error;
  return mapProduct(data);
}

export async function deleteOrderItem(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("order_items").delete().eq("id", id);
  if (error) throw error;
}

// ——— Product Batches ———

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
    manufactureDate: row.manufacture_date ? String(row.manufacture_date) : null,
    expiryDate: row.expiry_date ? String(row.expiry_date) : null,
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

async function getNextBatchSeq(productId: string, date: Date): Promise<number> {
  if (!supabase) return 1;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const prefix = `BATCH-${y}${m}${d}-`;
  const { count } = await supabase
    .from("product_batches")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .like("batch_number", `${prefix}%`);
  return (count ?? 0) + 1;
}

export async function getBatchesForProduct(productId: string): Promise<ProductBatch[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from("product_batches")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapBatch);
}

export async function getBatch(id: string): Promise<ProductBatch | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from("product_batches")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data ? mapBatch(data) : null;
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
}): Promise<ProductBatch> {
  if (!supabase) throw new Error("Supabase not configured");
  const userId = await getCurrentUserId();
  const now = new Date();
  const seq = await getNextBatchSeq(input.productId, now);
  const batchNumber = generateBatchNumber(now, seq);
  const quantityLitres = input.numberOfBottles * input.bottleSizeLitres;
  const { data, error } = await supabase
    .from("product_batches")
    .insert({
      product_id: input.productId,
      batch_number: batchNumber,
      number_of_bottles: input.numberOfBottles,
      bottle_size_litres: input.bottleSizeLitres,
      unit_price: input.unitPrice,
      cost_price: input.costPrice,
      quantity_litres: quantityLitres,
      manufacture_date: input.manufactureDate ?? null,
      expiry_date: input.expiryDate ?? null,
      notes: input.notes ?? null,
      user_id: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return mapBatch(data);
}

export async function updateBatch(
  id: string,
  input: Partial<Pick<ProductBatch, "numberOfBottles" | "bottleSizeLitres" | "unitPrice" | "costPrice" | "quantityLitres" | "manufactureDate" | "expiryDate" | "notes">>
): Promise<ProductBatch> {
  const userId = await getCurrentUserId();
  const payload: Record<string, unknown> = {};
  if (input.numberOfBottles !== undefined) payload.number_of_bottles = input.numberOfBottles;
  if (input.bottleSizeLitres !== undefined) payload.bottle_size_litres = input.bottleSizeLitres;
  if (input.unitPrice !== undefined) payload.unit_price = input.unitPrice;
  if (input.costPrice !== undefined) payload.cost_price = input.costPrice;
  // Recalculate quantity_litres (informational) whenever both bottle fields are present
  if (input.numberOfBottles !== undefined && input.bottleSizeLitres !== undefined) {
    payload.quantity_litres = input.numberOfBottles * input.bottleSizeLitres;
  } else if (input.quantityLitres !== undefined) {
    payload.quantity_litres = input.quantityLitres;
  }
  if (input.manufactureDate !== undefined) payload.manufacture_date = input.manufactureDate ?? null;
  if (input.expiryDate !== undefined) payload.expiry_date = input.expiryDate ?? null;
  if (input.notes !== undefined) payload.notes = input.notes ?? null;
  const { data, error } = await supabase!
    .from("product_batches")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) throw error;
  return mapBatch(data);
}

export async function deleteBatch(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  const { error } = await supabase!
    .from("product_batches")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw error;
}

// ── FEATURE FLAGS ────────────────────────────────────────────────────────────

/**
 * Fetches feature flags for the current user.
 * If no row exists yet (new user), inserts a default row and returns defaults.
 */
export async function getFeatureFlags(): Promise<FeatureFlags> {
  if (!isSupabaseConfigured() || !supabase) return defaultFlags;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return defaultFlags;

  const { data, error } = await supabase
    .from("feature_flags")
    .select("ai_price_update, ai_order_fill")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch feature flags:", error);
    return defaultFlags;
  }

  // No row yet — first login. Insert defaults.
  if (!data) {
    const { data: inserted, error: insertError } = await supabase
      .from("feature_flags")
      .insert({ user_id: user.id, ...defaultFlags })
      .select("ai_price_update, ai_order_fill")
      .single();

    if (insertError) {
      console.error("Failed to create feature flags:", insertError);
      return defaultFlags;
    }
    return inserted as FeatureFlags;
  }

  return data as FeatureFlags;
}

