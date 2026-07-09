import { NextResponse } from "next/server";
import { z } from "zod";

import { getBrowserOAuthFlowStatus } from "@/lib/credentials/chatgpt-browser-oauth.server";

const RequestSchema = z.object({
  flowId: z.string().min(1),
});

/**
 * POST /api/credentials/oauth/browser/status
 *
 * Returns the current browser OAuth flow status without exposing tokens.
 */
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

  const status = getBrowserOAuthFlowStatus(parsed.data.flowId);
  if (!status) {
    return NextResponse.json(
      { status: "failed", message: "Browser sign-in session was not found." },
      { status: 404 }
    );
  }

  return NextResponse.json(status);
}
