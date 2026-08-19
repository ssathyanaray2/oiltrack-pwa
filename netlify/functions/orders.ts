import type { Context } from "@netlify/functions";
import type { PoolClient } from "pg";
import { query, queryOne, getDb } from "./_db.js";
import { requireAuth } from "./_auth.js";
import {
  ok,
  created,
  noContent,
  badRequest,
  notFound,
  serverError,
} from "./_response.js";

// ---------------------------------------------------------------------------
// Helper: fetch a single order with its items and tags
// ---------------------------------------------------------------------------
async function fetchOrderWithDetails(orderId: string, userId: string) {
  const order = await queryOne(
    "SELECT * FROM orders WHERE id=$1 AND user_id=$2",
    [orderId, userId]
  );
  if (!order) return null;

  const items = await query(
    "SELECT * FROM order_items WHERE order_id=$1",
    [orderId]
  );
  const tags = await query(
    `SELECT t.id, t.name, t.color
     FROM tags t
     JOIN order_tags ot ON t.id = ot.tag_id
     WHERE ot.order_id=$1`,
    [orderId]
  );

  return { ...order, items, tags };
}

// ---------------------------------------------------------------------------
// Helper: replace order items inside an existing transaction client
// ---------------------------------------------------------------------------
async function replaceOrderItems(
  client: PoolClient,
  orderId: string,
  items: Array<{
    product_id?: string;
    product_name?: string;
    quantity: number;
    unit_price: number;
    cost_price?: number;
    batch_id?: string;
  }>
) {
  await client.query("DELETE FROM order_items WHERE order_id=$1", [orderId]);
  for (const item of items) {
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price, cost_price, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        orderId,
        item.product_id ?? null,
        item.product_name ?? null,
        item.quantity,
        item.unit_price,
        item.cost_price ?? null,
        item.batch_id ?? null,
      ]
    );
  }
}

export default async (req: Request, _context: Context) => {
  try {
    const user = await requireAuth(req.headers.get("authorization") ?? undefined);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const action = url.searchParams.get("action");

    // -----------------------------------------------------------------------
    // GET
    // -----------------------------------------------------------------------
    if (req.method === "GET") {
      // Single order
      if (id) {
        const order = await fetchOrderWithDetails(id, user.id);
        if (!order) return notFound();
        return ok(order);
      }

      // action=by-customer
      if (action === "by-customer") {
        const customerId = url.searchParams.get("customerId");
        if (!customerId) return badRequest("customerId is required");
        const rows = await query(
          "SELECT * FROM orders WHERE customer_id=$1 AND user_id=$2 ORDER BY order_date DESC",
          [customerId, user.id]
        );
        return ok(rows);
      }

      // action=since
      if (action === "since") {
        const since = url.searchParams.get("since");
        if (!since) return badRequest("since is required");
        const rows = await query<Record<string, unknown>>(
          "SELECT * FROM orders WHERE user_id=$1 AND order_date >= $2 ORDER BY order_date DESC",
          [user.id, since]
        );
        const orderIds = rows.map((r) => r.id);
        let items: Record<string, unknown>[] = [];
        if (orderIds.length > 0) {
          items = await query("SELECT * FROM order_items WHERE order_id = ANY($1)", [orderIds]);
        }
        const itemsByOrder: Record<string, unknown[]> = {};
        for (const item of items) {
          const oid = String(item.order_id);
          if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
          itemsByOrder[oid].push(item);
        }
        return ok(rows.map((r) => ({ ...r, items: itemsByOrder[String(r.id)] ?? [] })));
      }

      // action=counts — total and pending per customer
      if (action === "counts") {
        const rows = await query<{ customer_id: string; total: string; pending: string }>(
          `SELECT customer_id,
                  COUNT(*) AS total,
                  SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending
           FROM orders
           WHERE user_id=$1 AND customer_id IS NOT NULL
           GROUP BY customer_id`,
          [user.id]
        );
        const result: Record<string, { total: number; pending: number }> = {};
        for (const r of rows) {
          result[r.customer_id] = {
            total: Number(r.total),
            pending: Number(r.pending),
          };
        }
        return ok(result);
      }

      // action=last-orders — last order per customer
      if (action === "last-orders") {
        const rows = await query<{
          customer_id: string;
          customer_name: string;
          order_date: string;
          status: string;
        }>(
          `SELECT DISTINCT ON (customer_id)
                  customer_id,
                  customer_name,
                  order_date,
                  status
           FROM orders
           WHERE user_id=$1 AND customer_id IS NOT NULL
           ORDER BY customer_id, order_date DESC`,
          [user.id]
        );
        const result = rows.map((r) => ({
          customerId: r.customer_id,
          customerName: r.customer_name,
          date: r.order_date,
          status: r.status,
        }));
        return ok(result);
      }

      // Paginated list
      const page = parseInt(url.searchParams.get("page") ?? "0", 10);
      const pageSize = parseInt(url.searchParams.get("pageSize") ?? "30", 10);
      const status = url.searchParams.get("status") ?? "All";
      const sort = url.searchParams.get("sort") ?? "recent";
      const offset = page * pageSize;
      const orderDir = sort === "oldest" ? "ASC" : "DESC";
      // Fetch one extra row to determine if there are more pages
      const fetchSize = pageSize + 1;

      let rows: Record<string, unknown>[];
      if (status === "All") {
        rows = await query(
          `SELECT * FROM orders WHERE user_id=$1
           ORDER BY order_date ${orderDir}, created_at ${orderDir}
           LIMIT $2 OFFSET $3`,
          [user.id, fetchSize, offset]
        );
      } else {
        rows = await query(
          `SELECT * FROM orders WHERE user_id=$1 AND status=$2
           ORDER BY order_date ${orderDir}, created_at ${orderDir}
           LIMIT $3 OFFSET $4`,
          [user.id, status, fetchSize, offset]
        );
      }

      const hasMore = rows.length > pageSize;
      const pageRows = rows.slice(0, pageSize);

      // Batch-fetch items and tags for all orders in this page
      const orderIds = pageRows.map((r) => r.id);
      let items: Record<string, unknown>[] = [];
      let tagRows: Record<string, unknown>[] = [];
      if (orderIds.length > 0) {
        items = await query(
          "SELECT * FROM order_items WHERE order_id = ANY($1)",
          [orderIds]
        );
        tagRows = await query(
          `SELECT ot.order_id, t.id, t.name, t.color
           FROM order_tags ot JOIN tags t ON t.id = ot.tag_id
           WHERE ot.order_id = ANY($1)`,
          [orderIds]
        );
      }

      const itemsByOrder: Record<string, unknown[]> = {};
      for (const item of items) {
        const oid = String(item.order_id);
        if (!itemsByOrder[oid]) itemsByOrder[oid] = [];
        itemsByOrder[oid].push(item);
      }
      const tagsByOrder: Record<string, unknown[]> = {};
      for (const tag of tagRows) {
        const oid = String(tag.order_id);
        if (!tagsByOrder[oid]) tagsByOrder[oid] = [];
        tagsByOrder[oid].push({ id: tag.id, name: tag.name, color: tag.color });
      }

      const orders = pageRows.map((r) => ({
        ...r,
        items: itemsByOrder[String(r.id)] ?? [],
        tags: tagsByOrder[String(r.id)] ?? [],
      }));

      return ok({ orders, hasMore });
    }

    // -----------------------------------------------------------------------
    // POST — create order
    // -----------------------------------------------------------------------
    if (req.method === "POST") {
      const body = await req.json();
      const {
        customer_id,
        customer_name,
        order_date,
        status,
        payment_status,
        payment_method,
        amount_paid,
        delivery_date,
        delivery_charge,
        notes,
        total_amount,
        items,
      } = body;

      if (!order_date) return badRequest("order_date is required");
      if (total_amount === undefined) return badRequest("total_amount is required");

      const db = getDb();
      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const orderRow = await client.query(
          `INSERT INTO orders
             (customer_id, customer_name, order_date, status, payment_status,
              payment_method, amount_paid, delivery_date, delivery_charge, notes,
              total_amount, user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING *`,
          [
            customer_id ?? null,
            customer_name ?? null,
            order_date,
            status ?? "Pending",
            payment_status ?? "Unpaid",
            payment_method ?? null,
            amount_paid ?? null,
            delivery_date ?? null,
            delivery_charge ?? null,
            notes ?? null,
            total_amount,
            user.id,
          ]
        );

        const newOrder = orderRow.rows[0];

        if (Array.isArray(items) && items.length > 0) {
          await replaceOrderItems(client, newOrder.id, items);
        }

        await client.query("COMMIT");
        client.release();

        const full = await fetchOrderWithDetails(newOrder.id, user.id);
        return created(full);
      } catch (e) {
        await client.query("ROLLBACK");
        client.release();
        throw e;
      }
    }

    // -----------------------------------------------------------------------
    // PUT — update order
    // -----------------------------------------------------------------------
    if (req.method === "PUT") {
      if (!id) return badRequest("id is required");
      const body = await req.json();

      const updatableCols = [
        "customer_id",
        "customer_name",
        "order_date",
        "status",
        "payment_status",
        "payment_method",
        "amount_paid",
        "delivery_date",
        "delivery_charge",
        "notes",
        "total_amount",
        "receipt_number",
      ] as const;

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      for (const col of updatableCols) {
        if (col in body) {
          fields.push(`${col}=$${idx++}`);
          values.push(body[col]);
        }
      }

      const db = getDb();
      const client = await db.connect();
      try {
        await client.query("BEGIN");

        if (fields.length > 0) {
          values.push(id, user.id);
          const res = await client.query(
            `UPDATE orders SET ${fields.join(", ")} WHERE id=$${idx++} AND user_id=$${idx} RETURNING id`,
            values
          );
          if (res.rowCount === 0) {
            await client.query("ROLLBACK");
            client.release();
            return notFound();
          }
        } else {
          // verify ownership
          const res = await client.query(
            "SELECT id FROM orders WHERE id=$1 AND user_id=$2",
            [id, user.id]
          );
          if (res.rowCount === 0) {
            await client.query("ROLLBACK");
            client.release();
            return notFound();
          }
        }

        if (Array.isArray(body.items)) {
          await replaceOrderItems(client, id, body.items);
        }

        await client.query("COMMIT");
        client.release();

        const full = await fetchOrderWithDetails(id, user.id);
        return ok(full);
      } catch (e) {
        await client.query("ROLLBACK");
        client.release();
        throw e;
      }
    }

    // -----------------------------------------------------------------------
    // DELETE — cascades to order_items via FK
    // -----------------------------------------------------------------------
    if (req.method === "DELETE") {
      if (!id) return badRequest("id is required");
      const row = await queryOne(
        "DELETE FROM orders WHERE id=$1 AND user_id=$2 RETURNING id",
        [id, user.id]
      );
      if (!row) return notFound();
      return noContent();
    }

    return badRequest("Method not allowed");
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Unauthorised")
      return Response.json({ error: "Unauthorised" }, { status: 401 });
    return serverError(err);
  }
};
