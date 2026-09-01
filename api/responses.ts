export function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

export function message(detail: string, status: number): Response {
  return json({ detail }, status);
}

export function methodNotAllowed(allowed: string[]): Response {
  return new Response(JSON.stringify({ detail: "method not allowed" }), {
    status: 405,
    headers: {
      "allow": allowed.join(", "),
      "content-type": "application/json",
    },
  });
}
