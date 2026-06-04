
import { NextResponse } from "next/server";

import {
  getChat,
  getChatCostSummary,
} from "@/lib/chat/chat-sqlite-storage.server";

interface ChatCostRouteContext {
  params: Promise<{ chatId: string }>;
}

/** Returns the recorded model cost summary for one local chat session. */
export async function GET(
  _req: Request,
  context: ChatCostRouteContext
): Promise<Response> {
  const { chatId } = await context.params;

  try {
    const chat = await getChat(chatId);
    if (!chat) {
      return NextResponse.json({ message: "Chat not found." }, { status: 404 });
    }

    const summary = await getChatCostSummary(chatId);
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Failed to load chat cost summary:", error);
    return NextResponse.json(
      { message: "Failed to load chat cost summary." },
      { status: 500 }
    );
  }
}
