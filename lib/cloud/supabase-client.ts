"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getOrionCloudConfig } from "@/lib/cloud/config";

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;

let cachedClient: SupabaseBrowserClient | null = null;

/** Creates the optional Supabase browser client used only for Orion Cloud auth. */
export function createOrionCloudSupabaseClient(): SupabaseBrowserClient | null {
  const config = getOrionCloudConfig();
  if (!config) return null;

  cachedClient ??= createBrowserClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
  );
  return cachedClient;
}
