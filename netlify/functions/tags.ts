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
    const action = url.searchParams.get("action");
    const orderId = url.searchParams.get("orderId");

    // -----------------------------------------------------------------------
    // GET
    // -----------------------------------------------------------------------
    if (req.method === "GET") {
      // Tags for a specific order
      if (orderId) {
        const rows = await query(
          `SELECT t.id, t.name, t.color
           FROM tags t
           JOIN order_tags ot ON t.id = ot.tag_id
           WHERE ot.order_id=$1 AND t.user_id=$2`,
          [orderId, user.id]
        );
        return ok(rows);
      }

      // All tags for user
      const rows = await query(
        "SELECT * FROM tags WHERE user_id=$1 ORDER BY name",
        [user.id]
      );
      return ok(rows);
    }

    // -----------------------------------------------------------------------
    // POST — create tag OR assign tag to order
    // -----------------------------------------------------------------------
    if (req.method === "POST") {
      // action=assign: assign tag to order
      if (action === "assign") {
        const body = await req.json();
        const { order_id, tag_id } = body;
        if (!order_id || !tag_id) return badRequest("order_id and tag_id are required");

        // Verify tag belongs to user
        const tag = await queryOne(
          "SELECT id FROM tags WHERE id=$1 AND user_id=$2",
          [tag_id, user.id]
        );
        if (!tag) return notFound("Tag not found");

        // Upsert to avoid duplicate
        await queryOne(
          `INSERT INTO order_tags (order_id, tag_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [order_id, tag_id]
        );
        return ok({ order_id, tag_id });
      }

      // Create tag
      const body = await req.json();
      const { name, color } = body;
      if (!name) return badRequest("name is required");

      const row = await queryOne(
        `INSERT INTO tags (name, color, user_id)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, color ?? null, user.id]
      );
      return created(row);
    }

    // -----------------------------------------------------------------------
    // DELETE — delete tag OR remove tag from order
    // -----------------------------------------------------------------------
    if (req.method === "DELETE") {
      // action=remove: remove tag from order
      if (action === "remove") {
        const orderIdParam = url.searchParams.get("orderId");
        const tagId = url.searchParams.get("tagId");
        if (!orderIdParam || !tagId) return badRequest("orderId and tagId are required");

        await queryOne(
          "DELETE FROM order_tags WHERE order_id=$1 AND tag_id=$2",
          [orderIdParam, tagId]
        );
        return noContent();
      }

      // Delete tag
      if (!id) return badRequest("id is required");
      const row = await queryOne(
        "DELETE FROM tags WHERE id=$1 AND user_id=$2 RETURNING id",
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
