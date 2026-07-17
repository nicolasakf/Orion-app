import { POST as handleChatPost } from "@/app/api/chat/route";
import { ContextPreflightRequestSchema } from "@/lib/agent/context-preflight";

/** Measures the fully prepared chat prompt without invoking a model. */
export async function POST(req: Request): Promise<Response> {
  const parsed = ContextPreflightRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { title: "Invalid Request", message: "Context preflight request is invalid." },
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
