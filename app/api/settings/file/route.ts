import "server-only";

import { NextResponse } from "next/server";

import {
  loadUserSettingsRawFile,
  saveUserSettingsRawFile,
} from "@/lib/settings/user-file-storage.server";

/** Returns the raw user settings JSON file for in-app editing. */
export async function GET(): Promise<Response> {
  try {
    const file = await loadUserSettingsRawFile();
    return NextResponse.json(file);
  } catch (error) {
    console.error("Failed to load user settings file:", error);
    return NextResponse.json(
      { message: "Failed to load user settings file." },
      { status: 500 },
    );
  }
}

/** Validates and saves raw user settings JSON from the in-app editor. */
export async function PUT(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: "Request body is malformed." },
      { status: 400 },
    );
  }

  const content =
    typeof body === "object" &&
    body !== null &&
    "content" in body &&
    typeof body.content === "string"
      ? body.content
      : null;

  if (content === null) {
    return NextResponse.json(
      { message: "Request body must include a string `content` field." },
      { status: 400 },
    );
  }

  try {
    const document = await saveUserSettingsRawFile(content);
    return NextResponse.json({ document });
  } catch (error) {
    console.error("Failed to save user settings file:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save user settings file.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
