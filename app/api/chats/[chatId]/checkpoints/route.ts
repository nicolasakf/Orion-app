
import { NextResponse } from "next/server";

import { getEditCheckpointsForChat } from "@/lib/chat/chat-sqlite-storage.server";

interface ChatCheckpointsRouteContext {
  params: Promise<{ chatId: string }>;
}

/** Lists request-scoped edit checkpoints for one local chat. */
export async function GET(
  _req: Request,
  context: ChatCheckpointsRouteContext
): Promise<Response> {
  const { chatId } = await context.params;

  try {
    const checkpoints = await getEditCheckpointsForChat(chatId);
    return NextResponse.json({ checkpoints });
  } catch (error) {
    console.error("Failed to list edit checkpoints:", error);
    return NextResponse.json(
      { message: "Failed to list edit checkpoints." },
      { status: 500 }
    );
  }
}
