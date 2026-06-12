import { afterEach, describe, expect, it, vi } from "vitest";

import { getOrionCloudConfig, isOrionCloudConfigured } from "@/lib/cloud/config";

describe("Orion cloud config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is disabled when any required public cloud env var is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_ORION_API_BASE_URL", "https://api.orion.local");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.orion.local");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    expect(getOrionCloudConfig()).toBeNull();
    expect(isOrionCloudConfigured()).toBe(false);
  });

  it("normalizes configured API URLs and accepts the Supabase anon-key alias", () => {
    vi.stubEnv("NEXT_PUBLIC_ORION_API_BASE_URL", "https://api.orion.local///");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.orion.local");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "publishable-key");

    expect(getOrionCloudConfig()).toEqual({
      apiBaseUrl: "https://api.orion.local",
      supabaseUrl: "https://supabase.orion.local",
      supabasePublishableKey: "publishable-key",
    });
    expect(isOrionCloudConfigured()).toBe(true);
  });
});
