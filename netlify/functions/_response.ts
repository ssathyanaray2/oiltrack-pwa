export function ok(data: unknown) {
  return Response.json(data, { status: 200 });
}

export function created(data: unknown) {
  return Response.json(data, { status: 201 });
}

export function noContent() {
  return new Response(null, { status: 204 });
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export function unauthorised(message = "Unauthorised") {
  return Response.json({ error: message }, { status: 401 });
}

export function notFound(message = "Not found") {
  return Response.json({ error: message }, { status: 404 });
}

export function serverError(err: unknown) {
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return Response.json({ error: message }, { status: 500 });
}
