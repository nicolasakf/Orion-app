import { NextResponse } from "next/server";

import {
  deletePersonalContext,
  loadPersonalContext,
  savePersonalContext,
} from "@/lib/onboarding/personal-context.server";
import {
  containsHighConfidenceSecret,
  PersonalContextUpdateSchema,
} from "@/lib/onboarding/personal-context";

/** Adds client-safe validation state to a loaded personal-context response. */
async function getProfileResponse(): Promise<
  Awaited<ReturnType<typeof loadPersonalContext>> & { blockedForModel: boolean }
> {
  const profile = await loadPersonalContext();
  return {
    ...profile,
    blockedForModel: containsHighConfidenceSecret(profile.content),
  };
}

/** Returns the local `ORION.md` content and file metadata. */
export async function GET(): Promise<Response> {
  try {
    return NextResponse.json(await getProfileResponse());
  } catch (error) {
    console.error("Failed to load personal context:", error);
    return NextResponse.json(
      { message: "Failed to load personal context." },
      { status: 500 },
    );
  }
}

/** Validates and atomically replaces the local `ORION.md` file. */
export async function PUT(req: Request): Promise<Response> {
  const parsed = PersonalContextUpdateSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Personal context is malformed or too large." },
      { status: 400 },
    );
  }

  try {
    await savePersonalContext(parsed.data.content);
    return NextResponse.json(await getProfileResponse());
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to save personal context.",
      },
      { status: 400 },
    );
  }
}

/** Deletes `ORION.md` without deleting the resumable interview transcript. */
export async function DELETE(): Promise<Response> {
  try {
    await deletePersonalContext();
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete personal context:", error);
    return NextResponse.json(
      { message: "Failed to delete personal context." },
      { status: 500 },
    );
  }
}
