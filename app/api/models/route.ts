import { NextResponse } from "next/server";

import { CLIENT_MODEL_CATALOG } from "@/lib/agent/model-catalog";

/** Returns the checked-in OSS model catalog. */
export async function GET() {
  return NextResponse.json({ models: CLIENT_MODEL_CATALOG });
}
