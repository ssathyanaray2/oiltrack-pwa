import type { Context } from "@netlify/functions";
import { requireAuth } from "./_auth.js";
import { ok, serverError, unauthorised } from "./_response.js";

export default async (req: Request, context: Context) => {
  try {
    // TODO: implement
    return ok({ message: "not implemented" });
  } catch (err) {
    return serverError(err);
  }
};
