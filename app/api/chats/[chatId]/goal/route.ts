import { NextResponse } from "next/server";

import { GoalSessionSchema } from "@/lib/agent/goals/types";
import {
  deleteGoalSession,
  getGoalSession,
  saveGoalSession,
} from "@/lib/chat/chat-sqlite-storage.server";

interface RouteContext {
  params: Promise<{ chatId: string }>;
}

/** Returns the persisted goal session for one chat. */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { chatId } = await context.params;
  try {
    return NextResponse.json({ goal: await getGoalSession(chatId) });
  } catch (error) {
    console.error("Failed to load goal session:", error);
    return NextResponse.json({ message: "Failed to load goal session." }, { status: 500 });
  }
}

/** Creates or replaces the persisted goal session for one chat. */
export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  const { chatId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = GoalSessionSchema.safeParse(body);
  if (!parsed.success || parsed.data.chatId !== chatId) {
    return NextResponse.json(
      { message: "Goal session payload is invalid.", issues: parsed.success ? [] : parsed.error.issues },
      { status: 400 }
    );
  }
  try {
    await saveGoalSession(parsed.data);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to save goal session:", error);
    return NextResponse.json({ message: "Failed to save goal session." }, { status: 500 });
  }
}

/** Deletes the persisted goal session for one chat. */
export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const { chatId } = await context.params;
  try {
    await deleteGoalSession(chatId);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete goal session:", error);
    return NextResponse.json({ message: "Failed to delete goal session." }, { status: 500 });
  }
}

