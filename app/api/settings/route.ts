
import { NextResponse } from "next/server";

import {
  clearUserSettingsFile,
  loadUserSettingsDocumentWithStatus,
  saveUserSettingsDocument,
} from "@/lib/settings/user-file-storage.server";
import { UserSettingsDocumentSchema } from "@/lib/settings/schema";

/** Loads the non-secret user settings document persisted under `~/.orion`. */
export async function GET(): Promise<Response> {
  try {
    const result = await loadUserSettingsDocumentWithStatus();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to load user settings:", error);
    return NextResponse.json(
      { message: "Failed to load user settings." },
      { status: 500 }
    );
  }
}

/** Validates and saves the non-secret user settings document under `~/.orion`. */
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

  const parsed = UserSettingsDocumentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "User settings document is invalid.",
        issues: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  try {
    const document = await saveUserSettingsDocument(parsed.data);
    return NextResponse.json({ document });
  } catch (error) {
    console.error("Failed to save user settings:", error);
    return NextResponse.json(
      { message: "Failed to save user settings." },
      { status: 500 }
    );
  }
}

/** Removes the persisted user settings file so future loads use defaults. */
export async function DELETE(): Promise<Response> {
  try {
    await clearUserSettingsFile();
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Failed to clear user settings:", error);
    return NextResponse.json(
      { message: "Failed to clear user settings." },
      { status: 500 }
    );
  }
}
