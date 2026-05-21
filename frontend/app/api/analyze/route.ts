export const dynamic    = "force-dynamic";
export const fetchCache = "force-no-store";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(req: Request) {
  const { url } = await req.json();
  console.log("[API] → backend:", BACKEND_URL, "| url:", url);

  let backendRes: Response;
  try {
    backendRes = await fetch(`${BACKEND_URL}/analyze`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ url }),
    });
  } catch (e) {
    const errEvent = `data: ${JSON.stringify({
      step: "fetching", status: "error",
      error: "Cannot reach backend server. Is it running?",
    })}\n\n`;
    return new Response(errEvent, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  if (!backendRes.ok || !backendRes.body) {
    const errEvent = `data: ${JSON.stringify({
      step: "fetching", status: "error",
      error: `Backend returned HTTP ${backendRes.status}`,
    })}\n\n`;
    return new Response(errEvent, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  // Pipe the SSE stream straight through to the browser
  return new Response(backendRes.body, {
    headers: {
      "Content-Type":     "text/event-stream",
      "Cache-Control":    "no-cache",
      "Connection":       "keep-alive",
      "X-Accel-Buffering":"no",
    },
  });
}
