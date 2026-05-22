import "server-only";

import { readFile } from "fs/promises";
import { NextResponse } from "next/server";

import { LauncherJupyterConnectionSchema } from "@/lib/kernel/launcher-connection";
import { getJupyterConnectionFilePath } from "@/lib/local/orion-paths.server";

/** Returns the CLI-managed Jupyter connection when Orion was started locally. */
export async function GET(): Promise<Response> {
  try {
    const raw = await readFile(getJupyterConnectionFilePath(), "utf8");
    const connection = LauncherJupyterConnectionSchema.parse(JSON.parse(raw));
    return NextResponse.json({ connection });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return NextResponse.json(
        { message: "No CLI-managed Jupyter connection found." },
        { status: 404 }
      );
    }

    console.error("Failed to load CLI-managed Jupyter connection:", error);
    return NextResponse.json(
      { message: "Failed to load CLI-managed Jupyter connection." },
      { status: 500 }
    );
  }
}
