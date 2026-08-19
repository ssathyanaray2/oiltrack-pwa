import type { Context } from "@netlify/functions";
import { query, queryOne } from "./_db.js";
import { requireAuth } from "./_auth.js";
import {
  ok,
  created,
  noContent,
  badRequest,
  notFound,
  serverError,
} from "./_response.js";

export default async (req: Request, _context: Context) => {
  try {
    const user = await requireAuth(req.headers.get("authorization") ?? undefined);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (req.method === "GET") {
      if (id) {
        const row = await queryOne(
          "SELECT * FROM customers WHERE id=$1 AND user_id=$2",
          [id, user.id]
        );
        if (!row) return notFound();
        return ok(row);
      }
      const rows = await query(
        "SELECT * FROM customers WHERE user_id=$1 ORDER BY name",
        [user.id]
      );
      return ok(rows);
    }

    if (req.method === "POST") {
      const body = await req.json();
      const { name, phone, address, email, maps_link } = body;
      if (!name) return badRequest("name is required");
      const row = await queryOne(
        `INSERT INTO customers (name, phone, address, email, maps_link, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [name, phone ?? null, address ?? null, email ?? null, maps_link ?? null, user.id]
      );
      return created(row);
    }

    if (req.method === "PUT") {
      if (!id) return badRequest("id is required");
      const body = await req.json();
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      for (const col of ["name", "phone", "address", "email", "maps_link"] as const) {
        if (col in body) {
          fields.push(`${col}=$${idx++}`);
          values.push(body[col]);
        }
      }

      if (fields.length === 0) return badRequest("No fields to update");

      values.push(id, user.id);
      const row = await queryOne(
        `UPDATE customers SET ${fields.join(", ")} WHERE id=$${idx++} AND user_id=$${idx} RETURNING *`,
        values
      );
      if (!row) return notFound();
      return ok(row);
    }

    if (req.method === "DELETE") {
      if (!id) return badRequest("id is required");
      const row = await queryOne(
        "DELETE FROM customers WHERE id=$1 AND user_id=$2 RETURNING id",
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
