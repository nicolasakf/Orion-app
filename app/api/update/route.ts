import { spawnSync } from "child_process";

import { NextRequest, NextResponse } from "next/server";

import { buildInstallCommand } from "@/lib/update/install-command.server";
import { checkPackageUpdate } from "@/lib/update/package-registry";
import {
  OrionUpdateStateSchema,
  UpdateActionRequestSchema,
  UpdateSourceSchema,
} from "@/lib/update/types";

export const dynamic = "force-dynamic";

/** Returns update metadata supplied by a supported CLI launcher. */
function getLauncherMetadata() {
  if (process.env.ORION_LAUNCH_MODE !== "cli") return null;
  const source = UpdateSourceSchema.safeParse(process.env.ORION_INSTALL_CHANNEL);
  const currentVersion = process.env.ORION_CURRENT_VERSION;
  if (!source.success || source.data === "desktop" || !currentVersion) return null;
  return { source: source.data, currentVersion };
}

/** Rejects cross-origin mutation requests to the localhost update endpoint. */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Checks the package registry for a newer CLI release. */
export async function GET() {
  const metadata = getLauncherMetadata();
  if (!metadata) {
    return NextResponse.json(
      OrionUpdateStateSchema.parse({
        supported: false,
        currentVersion: "unknown",
        status: "unsupported",
      })
    );
  }

  try {
    const latestVersion = await checkPackageUpdate(metadata.currentVersion, metadata.source);
    return NextResponse.json(
      OrionUpdateStateSchema.parse({
        supported: true,
        source: metadata.source,
        currentVersion: metadata.currentVersion,
        latestVersion: latestVersion ?? metadata.currentVersion,
        status: latestVersion ? "available" : "current",
      })
    );
  } catch (error) {
    return NextResponse.json(
      OrionUpdateStateSchema.parse({
        supported: true,
        source: metadata.source,
        currentVersion: metadata.currentVersion,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 502 }
    );
  }
}

/** Installs a CLI update, then stops the packaged app so its parent launcher exits cleanly. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin update requests are not allowed." }, { status: 403 });
  }
  const metadata = getLauncherMetadata();
  if (!metadata) return NextResponse.json({ error: "Updates are unavailable." }, { status: 404 });

  const parsed = UpdateActionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update request." }, { status: 400 });

  try {
    const [command, args] = buildInstallCommand(metadata.source);
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: 180_000,
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || "Update failed.");
    }
    setTimeout(() => process.exit(0), 750).unref();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
