export interface OrionCloudConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
}

/** Reads optional Orion Cloud config from public environment variables. */
export function getOrionCloudConfig(): OrionCloudConfig | null {
  const apiBaseUrl = process.env.NEXT_PUBLIC_ORION_API_BASE_URL?.replace(/\/+$/, "");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!apiBaseUrl || !supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  return {
    apiBaseUrl,
    supabaseUrl,
    supabasePublishableKey,
  };
}

/** Returns true when this local Orion build can use hosted cloud features. */
export function isOrionCloudConfigured(): boolean {
  return getOrionCloudConfig() !== null;
}
