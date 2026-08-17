import { POST as handleChatPost } from "@/app/api/chat/route";
import { ContextMeasurementRequestSchema } from "@/lib/agent/context-usage";

/** Measures the fully prepared chat prompt without invoking a model. */
export async function POST(req: Request): Promise<Response> {
  const parsed = ContextMeasurementRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { title: "Invalid Request", message: "Context measurement request is invalid." },
      { status: 400 }
    );
  }
  const headers = new Headers(req.headers);
  headers.set("x-orion-context-preflight", "1");
  return handleChatPost(
    new Request(req.url, {
      method: "POST",
      headers,
      body: JSON.stringify(parsed.data),
      signal: req.signal,
    })
  );
}
