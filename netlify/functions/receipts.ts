import type { Context } from "@netlify/functions";
import { queryOne } from "./_db.js";
import { requireAuth } from "./_auth.js";
import {
  ok,
  badRequest,
  notFound,
  serverError,
} from "./_response.js";

/**
 * Given an order date string (YYYY-MM-DD), return the fiscal year start and end dates.
 * Fiscal year runs April 1 – March 31.
 * If month >= 4 (April), FY starts April 1 of that year.
 * Otherwise, FY starts April 1 of the previous year.
 */
function fiscalYearRange(orderDate: string): { fyStart: string; fyEnd: string } {
  const d = new Date(orderDate);
  const month = d.getUTCMonth() + 1; // 1-based
  const year = d.getUTCFullYear();

  const fyStartYear = month >= 4 ? year : year - 1;
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;
  return { fyStart, fyEnd };
}

export default async (req: Request, _context: Context) => {
  try {
    const user = await requireAuth(req.headers.get("authorization") ?? undefined);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const action = url.searchParams.get("action");

    // -----------------------------------------------------------------------
    // GET ?action=next-number&orderDate=YYYY-MM-DD
    // -----------------------------------------------------------------------
    if (req.method === "GET") {
      if (action === "next-number") {
        const orderDate = url.searchParams.get("orderDate");
        if (!orderDate) return badRequest("orderDate is required");

        const { fyStart, fyEnd } = fiscalYearRange(orderDate);

        const row = await queryOne<{ next_number: string }>(
          `SELECT COALESCE(MAX(receipt_number), 0) + 1 AS next_number
           FROM orders
           WHERE user_id=$1
             AND order_date >= $2
             AND order_date <= $3
             AND receipt_number IS NOT NULL`,
          [user.id, fyStart, fyEnd]
        );

        return ok({ next_number: Number(row?.next_number ?? 1), fy_start: fyStart, fy_end: fyEnd });
      }

      return badRequest("action is required");
    }

    // -----------------------------------------------------------------------
    // PUT ?id= — save receipt number to order
    // -----------------------------------------------------------------------
    if (req.method === "PUT") {
      if (!id) return badRequest("id is required");
      const body = await req.json();
      const { receipt_number } = body;
      if (receipt_number === undefined) return badRequest("receipt_number is required");

      const row = await queryOne(
        `UPDATE orders SET receipt_number=$1 WHERE id=$2 AND user_id=$3 RETURNING *`,
        [receipt_number, id, user.id]
      );
      if (!row) return notFound();
      return ok(row);
    }

    return badRequest("Method not allowed");
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Unauthorised")
      return Response.json({ error: "Unauthorised" }, { status: 401 });
    return serverError(err);
  }
};
