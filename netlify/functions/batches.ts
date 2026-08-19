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

// Sync product stock from batches
async function syncProductStock(
  client: PoolClient,
  productId: string
) {
  await client.query(
    `UPDATE products
     SET quantity = (
       SELECT COALESCE(SUM(number_of_bottles), 0)
       FROM product_batches
       WHERE product_id=$1
     )
     WHERE id=$1`,
    [productId]
  );
}

export default async (req: Request, _context: Context) => {
  try {
    const user = await requireAuth(req.headers.get("authorization") ?? undefined);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const productId = url.searchParams.get("productId");

    // -----------------------------------------------------------------------
    // GET
    // -----------------------------------------------------------------------
    if (req.method === "GET") {
      if (id) {
        const row = await queryOne(
          "SELECT * FROM product_batches WHERE id=$1 AND user_id=$2",
          [id, user.id]
        );
        if (!row) return notFound();
        return ok(row);
      }
      if (productId) {
        const rows = await query(
          "SELECT * FROM product_batches WHERE product_id=$1 AND user_id=$2 ORDER BY created_at DESC",
          [productId, user.id]
        );
        return ok(rows);
      }
      return badRequest("productId or id is required");
    }

    // -----------------------------------------------------------------------
    // POST — create batch
    // -----------------------------------------------------------------------
    if (req.method === "POST") {
      const body = await req.json();
      const {
        product_id,
        batch_number,
        number_of_bottles,
        bottle_size_litres,
        unit_price,
        cost_price,
        quantity_litres,
        manufacture_date,
        expiry_date,
        notes,
      } = body;

      if (!product_id) return badRequest("product_id is required");

      const db = getDb();
      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const res = await client.query(
          `INSERT INTO product_batches
             (product_id, batch_number, number_of_bottles, bottle_size_litres,
              unit_price, cost_price, quantity_litres, manufacture_date, expiry_date,
              notes, user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING *`,
          [
            product_id,
            batch_number ?? null,
            number_of_bottles ?? null,
            bottle_size_litres ?? null,
            unit_price ?? null,
            cost_price ?? null,
            quantity_litres ?? null,
            manufacture_date ?? null,
            expiry_date ?? null,
            notes ?? null,
            user.id,
          ]
        );

        await syncProductStock(client, product_id);
        await client.query("COMMIT");
        client.release();
        return created(res.rows[0]);
      } catch (e) {
        await client.query("ROLLBACK");
        client.release();
        throw e;
      }
    }

    // -----------------------------------------------------------------------
    // PUT — update batch then sync stock
    // -----------------------------------------------------------------------
    if (req.method === "PUT") {
      if (!id) return badRequest("id is required");
      const body = await req.json();

      const updatableCols = [
        "batch_number",
        "number_of_bottles",
        "bottle_size_litres",
        "unit_price",
        "cost_price",
        "quantity_litres",
        "manufacture_date",
        "expiry_date",
        "notes",
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

      if (fields.length === 0) return badRequest("No fields to update");

      const db = getDb();
      const client = await db.connect();
      try {
        await client.query("BEGIN");

        values.push(id, user.id);
        const res = await client.query(
          `UPDATE product_batches SET ${fields.join(", ")}
           WHERE id=$${idx++} AND user_id=$${idx}
           RETURNING *`,
          values
        );

        if (res.rowCount === 0) {
          await client.query("ROLLBACK");
          client.release();
          return notFound();
        }

        const updated = res.rows[0];
        await syncProductStock(client, updated.product_id);
        await client.query("COMMIT");
        client.release();
        return ok(updated);
      } catch (e) {
        await client.query("ROLLBACK");
        client.release();
        throw e;
      }
    }

    // -----------------------------------------------------------------------
    // DELETE — delete batch then sync stock
    // -----------------------------------------------------------------------
    if (req.method === "DELETE") {
      if (!id) return badRequest("id is required");

      const db = getDb();
      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const res = await client.query(
          "DELETE FROM product_batches WHERE id=$1 AND user_id=$2 RETURNING product_id",
          [id, user.id]
        );

        if (res.rowCount === 0) {
          await client.query("ROLLBACK");
          client.release();
          return notFound();
        }

        const { product_id } = res.rows[0];
        await syncProductStock(client, product_id);
        await client.query("COMMIT");
        client.release();
        return noContent();
      } catch (e) {
        await client.query("ROLLBACK");
        client.release();
        throw e;
      }
    }

    return badRequest("Method not allowed");
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Unauthorised")
      return Response.json({ error: "Unauthorised" }, { status: 401 });
    return serverError(err);
  }
};
