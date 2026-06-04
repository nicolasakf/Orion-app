
import { NextResponse } from "next/server";

import { RecordEditCheckpointTargetRequestSchema } from "@/lib/agent/edit-checkpoints";
import { recordEditCheckpointTarget } from "@/lib/chat/chat-sqlite-storage.server";

/** Records one landed edit target into the request-scoped checkpoint ledger. */
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

  const parsed = RecordEditCheckpointTargetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Checkpoint target payload is invalid.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const checkpoint = await recordEditCheckpointTarget(parsed.data);
    return NextResponse.json({ checkpoint });
  } catch (error) {
    console.error("Failed to record edit checkpoint:", error);
    return NextResponse.json(
      { message: "Failed to record edit checkpoint." },
      { status: 500 }
    );
  }
}
