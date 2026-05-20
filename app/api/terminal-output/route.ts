import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { saveTerminalOutputSpill } from "@/lib/local/terminal-output-storage.server";

const SaveTerminalOutputRequestSchema = z.object({
  content: z.string(),
});

/** Persists large agent terminal output under `~/.orion/terminal`. */
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Request body is malformed." },
      { status: 400 }
    );
  }

  const parsed = SaveTerminalOutputRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Terminal output payload is invalid.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  try {
    const filePath = await saveTerminalOutputSpill(parsed.data.content);
    return NextResponse.json({ filePath });
  } catch (error) {
    console.error("Failed to save terminal output spill:", error);
    return NextResponse.json(
      { message: "Failed to save terminal output." },
      { status: 500 }
    );
  }
}
