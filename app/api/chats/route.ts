
import { NextResponse } from "next/server";
import { z } from "zod";

import { ChatWireSchema } from "@/lib/chat/chat-types";
import {
  clearChats,
  getChatMetas,
  getChats,
  interruptOpenEditCheckpoints,
  saveChat,
  saveChats,
} from "@/lib/chat/chat-sqlite-storage.server";

const SaveChatsRequestSchema = z.object({
  chats: z.array(ChatWireSchema),
});

/** Lists local chats from SQLite, optionally returning metadata only. */
export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const metadataOnly = url.searchParams.get("metadataOnly") === "true";
    await interruptOpenEditCheckpoints({ olderThanMs: 5 * 60 * 1000 });
    const chats = metadataOnly ? await getChatMetas() : await getChats();
    return NextResponse.json({ chats });
  } catch (error) {
    console.error("Failed to list chats:", error);
    return NextResponse.json(
      { message: "Failed to list chats." },
      { status: 500 }
    );
  }
}

/** Saves one complete local chat to SQLite. */
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

  const parsed = ChatWireSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Chat payload is invalid.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    await saveChat(parsed.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to save chat:", error);
    return NextResponse.json(
      { message: "Failed to save chat." },
      { status: 500 }
    );
  }
}

/** Saves multiple complete local chats to SQLite. */
export async function PUT(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Request body is malformed." },
      { status: 400 }
    );
  }

  const parsed = SaveChatsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Chats payload is invalid.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    await saveChats(parsed.data.chats);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to save chats:", error);
    return NextResponse.json(
      { message: "Failed to save chats." },
      { status: 500 }
    );
  }
}

/** Clears all local chat history from SQLite. */
export async function DELETE(): Promise<Response> {
  try {
    await clearChats();
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to clear chats:", error);
    return NextResponse.json(
      { message: "Failed to clear chats." },
      { status: 500 }
    );
  }
}
