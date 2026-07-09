import { NextResponse } from "next/server";

import { startBrowserOAuthFlow } from "@/lib/credentials/chatgpt-browser-oauth.server";

/**
 * POST /api/credentials/oauth/browser/start
 *
 * Starts ChatGPT browser OAuth using the Codex localhost callback URI.
 */
export async function POST(): Promise<Response> {
  try {
    return NextResponse.json(await startBrowserOAuthFlow());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start browser sign-in.";
    return NextResponse.json(
      { title: "Browser Sign-In Failed", message },
      { status: 500 }
    );
  }
}
