
import { NextResponse } from "next/server";

import { UpdateEditCheckpointStatusRequestSchema } from "@/lib/agent/edit-checkpoints";
import {
  getEditCheckpointByRequestId,
  updateEditCheckpointStatus,
} from "@/lib/chat/chat-sqlite-storage.server";

interface CheckpointRouteContext {
  params: Promise<{ requestId: string }>;
}

/** Loads one request-scoped edit checkpoint. */
export async function GET(
  _req: Request,
  context: CheckpointRouteContext
): Promise<Response> {
  const { requestId } = await context.params;

  try {
    const checkpoint = await getEditCheckpointByRequestId(requestId);
    if (!checkpoint) {
      return NextResponse.json(
        { message: "Checkpoint not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({ checkpoint });
  } catch (error) {
    console.error("Failed to load edit checkpoint:", error);
    return NextResponse.json(
      { message: "Failed to load edit checkpoint." },
      { status: 500 }
    );
  }
}

/** Updates one request-scoped edit checkpoint status. */
export async function PATCH(
  req: Request,
  context: CheckpointRouteContext
): Promise<Response> {
  const { requestId } = await context.params;
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Request body is malformed." },
      { status: 400 }
    );
  }

  const parsed = UpdateEditCheckpointStatusRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Checkpoint status payload is invalid.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const checkpoint = await updateEditCheckpointStatus(requestId, parsed.data);
    if (!checkpoint) {
      return NextResponse.json(
        { message: "Checkpoint not found." },
        { status: 404 }
      );
    }
    return NextResponse.json({ checkpoint });
  } catch (error) {
    console.error("Failed to update edit checkpoint:", error);
    return NextResponse.json(
      { message: "Failed to update edit checkpoint." },
      { status: 500 }
    );
  }
}
