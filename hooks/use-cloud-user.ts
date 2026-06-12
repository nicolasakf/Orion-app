"use client";

import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import * as React from "react";

import { createOrionCloudSupabaseClient } from "@/lib/cloud/supabase-client";

export interface UseCloudUserResult {
  configured: boolean;
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/** Tracks the optional Orion Cloud Supabase user session. */
export function useCloudUser(): UseCloudUserResult {
  const supabase = React.useMemo(() => createOrionCloudSupabaseClient(), []);
  const [user, setUser] = React.useState<User | null>(null);
  const [accessToken, setAccessToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(Boolean(supabase));

  const refresh = React.useCallback(async () => {
    if (!supabase) {
      setUser(null);
      setAccessToken(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase.auth.getSession();
    setUser(data.session?.user ?? null);
    setAccessToken(data.session?.access_token ?? null);
    setLoading(false);
  }, [supabase]);

  React.useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    void refresh();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null);
        setAccessToken(session?.access_token ?? null);
        setLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, [refresh, supabase]);

  return {
    configured: Boolean(supabase),
    user,
    accessToken,
    loading,
    refresh,
  };
}
