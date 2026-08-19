import type { Context } from "@netlify/functions";
import { queryOne } from "./_db.js";
import { ok, serverError } from "./_response.js";

export default async (_req: Request, _context: Context) => {
  try {
    const result = await queryOne<{ now: string }>("SELECT NOW() as now");
    return ok({ status: "ok", db: "connected", time: result?.now });
  } catch (err) {
    return serverError(err);
  }
};
