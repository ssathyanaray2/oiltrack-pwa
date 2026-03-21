import { supabase, isSupabaseConfigured } from "./supabase";
import type { Product, Customer, Order, OrderItem } from "./types";

/** Map DB row to Product (schema: quantity, unit_price, reorder_threshold) */
function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    stock: Number(row.quantity),
    unit: String(row.unit),
    lowStockThreshold: Number(row.reorder_threshold),
    pricePerLiter: Number(row.unit_price),
    sellingPrice: Number(row.selling_price ?? 0),
  };
}

/** Map DB row to Customer (schema has no email unless you add it) */
function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: String(row.id),
    name: String(row.name),
    phone: String(row.phone ?? ""),
    address: String(row.address ?? ""),
    email: String(row.email ?? "")
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
    date: String(orderRow.order_date ?? orderRow.date ?? new Date().toISOString().slice(0, 10)),
    status: (orderRow.status as Order["status"]) ?? "Pending",
    paymentStatus: (orderRow.payment_status as Order["paymentStatus"]) ?? "Unpaid",
    notes: orderRow.notes != null ? String(orderRow.notes) : undefined,
    items: itemRows.map((item) => ({
      productId: String(item.product_id),
      quantity: Number(item.quantity),
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

export async function createProduct(input: Omit<Product, "id">): Promise<Product> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase
    .from("products")
    .insert({
      name: input.name,
      quantity: input.stock,
      unit: input.unit,
      reorder_threshold: input.lowStockThreshold,
      unit_price: input.pricePerLiter,
      selling_price: input.sellingPrice ?? 0,
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
  if (!supabase) throw new Error("Supabase not configured");
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.stock !== undefined) payload.quantity = input.stock;
  if (input.unit !== undefined) payload.unit = input.unit;
  if (input.lowStockThreshold !== undefined) payload.reorder_threshold = input.lowStockThreshold;
  if (input.pricePerLiter !== undefined) payload.unit_price = input.pricePerLiter;
  if (input.sellingPrice !== undefined) payload.selling_price = input.sellingPrice;
  const { data, error } = await supabase.from("products").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return mapProduct(data);
}

export async function deleteProduct(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
}

/** Add or remove stock (convenience for inventory restock) */
export async function updateProductStock(id: string, delta: number): Promise<Product> {
  const product = await getProduct(id);
  if (!product) throw new Error("Product not found");
  return updateProduct(id, { stock: Math.max(0, product.stock + delta) });
}

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
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: input.name,
      phone: input.phone ?? null,
      address: input.address ?? null,
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
  if (!supabase) throw new Error("Supabase not configured");
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.address !== undefined) payload.address = input.address;
  const { data, error } = await supabase.from("customers").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return mapCustomer(data);
}

export async function deleteCustomer(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

// ——— Orders (with order_items: one item per order for current UI) ———

export async function getOrders(): Promise<Order[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .order("order_date", { ascending: false });
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
  notes?: string;
  items?: Array<{ productId: string; quantity: number }>;
}): Promise<Order> {
  if (!supabase) throw new Error("Supabase not configured");

  const itemList = order.items && order.items.length > 0
    ? order.items
    : [{ productId: order.productId, quantity: order.quantity }];

  const productMap = new Map<string, Product>();
  for (const item of itemList) {
    if (!productMap.has(item.productId)) {
      const p = await getProduct(item.productId);
      if (p) productMap.set(item.productId, p);
    }
  }

  const totalAmount = itemList.reduce((sum, item) => {
    const p = productMap.get(item.productId);
    return sum + item.quantity * (p?.pricePerLiter ?? 0);
  }, 0);

  const orderPayload: Record<string, unknown> = {
    customer_id: order.customerId || null,
    customer_name: order.customerName,
    order_date: order.date,
    status: order.status,
    total_amount: totalAmount,
    notes: order.notes ?? null,
  };
  if (order.paymentStatus != null) orderPayload.payment_status = order.paymentStatus;

  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .insert(orderPayload)
    .select()
    .single();
  if (orderError) throw orderError;

  for (const item of itemList) {
    const p = productMap.get(item.productId);
    const { error: itemError } = await supabase.from("order_items").insert({
      order_id: orderRow.id,
      product_id: item.productId,
      product_name: p?.name ?? "",
      quantity: item.quantity,
      unit_price: p?.pricePerLiter ?? 0,
    });
    if (itemError) throw itemError;
  }

  if (order.status !== "Cancelled") {
    for (const item of itemList) {
      const p = productMap.get(item.productId);
      if (p) await updateProduct(item.productId, { stock: Math.max(0, p.stock - item.quantity) });
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
    notes?: string;
    items?: Array<{ productId: string; quantity: number }>;
  }
): Promise<Order> {
  if (!supabase) throw new Error("Supabase not configured");

  const existing = await getOrder(id);
  if (!existing) throw new Error("Order not found");

  const orderPayload: Record<string, unknown> = {};
  if (input.date !== undefined) orderPayload.order_date = input.date;
  if (input.status !== undefined) orderPayload.status = input.status;
  if (input.paymentStatus !== undefined) orderPayload.payment_status = input.paymentStatus;
  if (input.notes !== undefined) orderPayload.notes = input.notes;
  if (input.customerId !== undefined) orderPayload.customer_id = input.customerId;
  if (input.customerName !== undefined) orderPayload.customer_name = input.customerName;

  const newItems = input.items && input.items.length > 0
    ? input.items
    : input.productId !== undefined || input.quantity !== undefined
      ? [{ productId: input.productId ?? existing.productId, quantity: input.quantity ?? existing.quantity }]
      : null;

  if (newItems) {
    // Restore stock for existing items
    if (existing.status !== "Cancelled" && existing.items?.length) {
      for (const item of existing.items) {
        const prod = await getProduct(item.productId);
        if (prod) await updateProduct(item.productId, { stock: prod.stock + item.quantity });
      }
    }

    // Calculate new total
    const productMap = new Map<string, Product>();
    for (const item of newItems) {
      if (!productMap.has(item.productId)) {
        const p = await getProduct(item.productId);
        if (p) productMap.set(item.productId, p);
      }
    }
    orderPayload.total_amount = newItems.reduce((sum, item) => {
      const p = productMap.get(item.productId);
      return sum + item.quantity * (p?.pricePerLiter ?? 0);
    }, 0);

    // Replace all order items
    await supabase.from("order_items").delete().eq("order_id", id);
    for (const item of newItems) {
      const p = productMap.get(item.productId);
      await supabase.from("order_items").insert({
        order_id: id,
        product_id: item.productId,
        product_name: p?.name ?? "",
        quantity: item.quantity,
        unit_price: p?.pricePerLiter ?? 0,
      });
    }

    // Deduct stock for new items (unless cancelling)
    const newStatus = input.status ?? existing.status;
    if (newStatus !== "Cancelled") {
      for (const item of newItems) {
        const p = productMap.get(item.productId);
        if (p) await updateProduct(item.productId, { stock: Math.max(0, p.stock - item.quantity) });
      }
    }
  }

  // Handle cancellation stock restore (when no items change but status changes to Cancelled)
  if (!newItems && input.status === "Cancelled" && existing.status !== "Cancelled" && existing.items?.length) {
    for (const item of existing.items) {
      const prod = await getProduct(item.productId);
      if (prod) await updateProduct(item.productId, { stock: prod.stock + item.quantity });
    }
  }

  if (Object.keys(orderPayload).length > 0) {
    const { error } = await supabase.from("orders").update(orderPayload).eq("id", id);
    if (error) throw error;
  }

  return getOrder(id) as Promise<Order>;
}

export async function deleteOrder(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const order = await getOrder(id);
  if (order && order.status !== "Cancelled" && order.productId) {
    const product = await getProduct(order.productId);
    if (product) await updateProduct(order.productId, { stock: product.stock + order.quantity });
  }
  await supabase.from("order_items").delete().eq("order_id", id);
  const { error } = await supabase.from("orders").delete().eq("id", id);
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

export async function createOrderItem(input: Omit<OrderItem, "id">): Promise<OrderItem> {
  if (!supabase) throw new Error("Supabase not configured");
  const product = await getProduct(input.productId);
  const unitPrice = product?.pricePerLiter ?? 0;
  const { data, error } = await supabase
    .from("order_items")
    .insert({
      order_id: input.orderId,
      product_id: input.productId,
      product_name: product?.name ?? "",
      quantity: input.quantity,
      unit_price: unitPrice,
    })
    .select()
    .single();
  if (error) throw error;
  return mapOrderItem(data);
}

export async function updateOrderItem(
  id: string,
  input: Partial<Omit<OrderItem, "id" | "orderId">>
): Promise<OrderItem> {
  if (!supabase) throw new Error("Supabase not configured");
  const payload: Record<string, unknown> = {};
  if (input.productId !== undefined) {
    payload.product_id = input.productId;
    const product = await getProduct(input.productId);
    if (product) {
      payload.product_name = product.name;
      payload.unit_price = product.pricePerLiter;
    }
  }
  if (input.quantity !== undefined) payload.quantity = input.quantity;
  const { data, error } = await supabase
    .from("order_items")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapOrderItem(data);
}

export async function updateProductUnitPrice(id: string, unitPrice: number): Promise<Product> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.from('products').update({ unit_price: unitPrice })
    .eq('id', id).select().single();
  if (error) throw error;
  return mapProduct(data);
}

export async function updateProductSellingPrice(id: string, sellingPrice: number): Promise<Product> {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.from('products').update({ selling_price: sellingPrice })
    .eq('id', id).select().single();
  if (error) throw error;
  return mapProduct(data);
}

export async function deleteOrderItem(id: string): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("order_items").delete().eq("id", id);
  if (error) throw error;
}

