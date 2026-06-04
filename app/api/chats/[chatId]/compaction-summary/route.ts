
import { NextResponse } from "next/server";
import { z } from "zod";

import { CompactionSummaryWireSchema } from "@/lib/chat/chat-types";
import { updateCompactionSummary } from "@/lib/chat/chat-sqlite-storage.server";

const UpdateCompactionSummaryRequestSchema = z.object({
  summary: CompactionSummaryWireSchema.nullable(),
});

interface CompactionSummaryRouteContext {
  params: Promise<{ chatId: string }>;
}

/** Updates or clears a chat compaction summary without rewriting messages. */
export async function PUT(
  req: Request,
  context: CompactionSummaryRouteContext
): Promise<Response> {
  const { chatId } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Request body is malformed." },
      { status: 400 }
    );
  }

  const parsed = UpdateCompactionSummaryRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Compaction summary payload is invalid.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  try {
    await updateCompactionSummary(chatId, parsed.data.summary);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to update compaction summary:", error);
    return NextResponse.json(
      { message: "Failed to update compaction summary." },
      { status: 500 }
    );
  }
}
