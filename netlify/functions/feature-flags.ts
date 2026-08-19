import type { Context } from "@netlify/functions";
import { queryOne } from "./_db.js";
import { requireAuth } from "./_auth.js";
import {
  ok,
  badRequest,
  serverError,
} from "./_response.js";

export default async (req: Request, _context: Context) => {
  try {
    const user = await requireAuth(req.headers.get("authorization") ?? undefined);

    // -----------------------------------------------------------------------
    // GET — return feature flags; insert defaults if no row exists
    // -----------------------------------------------------------------------
    if (req.method === "GET") {
      let row = await queryOne(
        "SELECT * FROM feature_flags WHERE user_id=$1",
        [user.id]
      );

      if (!row) {
        row = await queryOne(
          `INSERT INTO feature_flags (user_id, ai_price_update, ai_order_fill)
           VALUES ($1, true, true)
           RETURNING *`,
          [user.id]
        );
      }

      return ok(row);
    }

    // -----------------------------------------------------------------------
    // PUT — update feature flags
    // -----------------------------------------------------------------------
    if (req.method === "PUT") {
      const body = await req.json();
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      for (const col of ["ai_price_update", "ai_order_fill"] as const) {
        if (col in body) {
          fields.push(`${col}=$${idx++}`);
          values.push(body[col]);
        }
      }

      if (fields.length === 0) return badRequest("No fields to update");

      values.push(user.id);
      const row = await queryOne(
        `UPDATE feature_flags SET ${fields.join(", ")} WHERE user_id=$${idx} RETURNING *`,
        values
      );

      // If no row existed yet, upsert
      if (!row) {
        const upserted = await queryOne(
          `INSERT INTO feature_flags (user_id, ai_price_update, ai_order_fill)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE
             SET ai_price_update = EXCLUDED.ai_price_update,
                 ai_order_fill   = EXCLUDED.ai_order_fill
           RETURNING *`,
          [
            user.id,
            "ai_price_update" in body ? body.ai_price_update : true,
            "ai_order_fill" in body ? body.ai_order_fill : true,
          ]
        );
        return ok(upserted);
      }

      return ok(row);
    }

    return badRequest("Method not allowed");
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Unauthorised")
      return Response.json({ error: "Unauthorised" }, { status: 401 });
    return serverError(err);
  }
};
