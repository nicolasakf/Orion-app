import { NextResponse } from "next/server";

import {
  clearBusinessStackSelection,
  loadBusinessStackSelection,
  saveBusinessStackSelection,
} from "@/lib/onboarding/personal-context.server";
import { BusinessStackSelectionSchema } from "@/lib/onboarding/business-tools";

/** Returns the persisted Business onboarding stack answers. */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json({ selection: await loadBusinessStackSelection() });
  } catch (error) {
    console.error("Failed to load the business stack selection:", error);
    return NextResponse.json(
      { message: "Failed to load your saved tool selection." },
      { status: 500 },
    );
  }
}

/** Replaces the stack answers as the user works through the picker. */
export async function PUT(req: Request): Promise<Response> {
  const parsed = BusinessStackSelectionSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: "The tool selection is malformed or too large." },
      { status: 400 },
    );
  }

  try {
    await saveBusinessStackSelection(parsed.data);
    return NextResponse.json({ selection: parsed.data });
  } catch (error) {
    console.error("Failed to save the business stack selection:", error);
    return NextResponse.json(
      { message: "Failed to save your tool selection." },
      { status: 500 },
    );
  }
}

/** Clears the stack answers without touching `ORION.md`. */
export async function DELETE(): Promise<Response> {
  try {
    await clearBusinessStackSelection();
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to clear the business stack selection:", error);
    return NextResponse.json(
      { message: "Failed to clear your tool selection." },
      { status: 500 },
    );
  }
}
