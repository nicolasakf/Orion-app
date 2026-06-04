import { NextResponse } from "next/server";

import { getMergedModelCatalog, getMergedProviderCatalog } from "@/lib/agent/model-catalog.server";

/** Returns the merged model catalog and provider metadata. */
export async function GET() {
  return NextResponse.json({
    models: await getMergedModelCatalog(),
    providers: await getMergedProviderCatalog(),
  });
}
