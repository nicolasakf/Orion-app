import { NextResponse } from "next/server";
import { z } from "zod";

import { cancelBrowserOAuthFlow } from "@/lib/credentials/chatgpt-browser-oauth.server";

const RequestSchema = z.object({
  flowId: z.string().min(1),
});

/** Cancels an active ChatGPT browser OAuth flow. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { title: "Invalid Request", message: "Request body is malformed." },
      { status: 400 }
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { title: "Invalid Request", message: "flowId is required." },
      { status: 400 }
    );
  }

  cancelBrowserOAuthFlow(parsed.data.flowId);
  return new Response(null, { status: 204 });
}
