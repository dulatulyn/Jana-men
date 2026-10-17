const AI_URL = (process.env.AI_URL || "http://localhost:8001").replace(/\/$/, "");

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let upstream: Response;
  try {
    upstream = await fetch(`${AI_URL}/ask/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: req.headers.get("authorization") ?? "",
      },
      body: await req.text(),
      signal: req.signal,
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: { code: "ai_unavailable", message: "AI service is unavailable" } }, { status: 502 });
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
