import "server-only";

import { NextResponse } from "next/server";

import {
  deleteChat,
  getChat,
} from "@/lib/chat/chat-sqlite-storage.server";

interface ChatRouteContext {
  params: Promise<{ chatId: string }>;
}

/** Loads one complete local chat by id. */
export async function GET(
  _req: Request,
  context: ChatRouteContext
): Promise<Response> {
  const { chatId } = await context.params;

  try {
    const chat = await getChat(chatId);
    if (!chat) {
      return NextResponse.json({ message: "Chat not found." }, { status: 404 });
    }
    return NextResponse.json({ chat });
  } catch (error) {
    console.error("Failed to load chat:", error);
    return NextResponse.json(
      { message: "Failed to load chat." },
      { status: 500 }
    );
  }
}

/** Deletes one local chat by id. */
export async function DELETE(
  _req: Request,
  context: ChatRouteContext
): Promise<Response> {
  const { chatId } = await context.params;

  try {
    await deleteChat(chatId);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete chat:", error);
    return NextResponse.json(
      { message: "Failed to delete chat." },
      { status: 500 }
    );
  }
}
