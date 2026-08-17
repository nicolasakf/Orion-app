"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getOrionCloudConfig } from "@/lib/cloud/config";
import {
  PublishedNotebookImportRequestSchema,
  savePendingPublishedNotebookImport,
} from "@/lib/cloud/published-import";

interface CloudOpenClientProps {
  slug: string;
  apiBaseUrl: string;
}

/** Avoids importing through the local app origin when a stale handoff URL used it as apiBaseUrl. */
function resolveImportApiBaseUrl(apiBaseUrl: string): string {
  if (typeof window === "undefined") return apiBaseUrl;
  const configuredApiBaseUrl = getOrionCloudConfig()?.apiBaseUrl;
  if (!configuredApiBaseUrl) return apiBaseUrl;

  try {
    const handoffOrigin = new URL(apiBaseUrl).origin;
    if (handoffOrigin === window.location.origin) return configuredApiBaseUrl;
  } catch {
    return apiBaseUrl;
  }

  return apiBaseUrl;
}

/** Captures a hosted notebook handoff, then opens the main local Orion app. */
export function CloudOpenClient({ slug, apiBaseUrl }: CloudOpenClientProps) {
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const resolvedApiBaseUrl = resolveImportApiBaseUrl(apiBaseUrl);
    const parsed = PublishedNotebookImportRequestSchema.safeParse({
      slug,
      apiBaseUrl: resolvedApiBaseUrl,
      createdAt: Date.now(),
    });
    if (!parsed.success) {
      setError("This Orion notebook link is missing required import details.");
      return;
    }

    savePendingPublishedNotebookImport({
      slug: parsed.data.slug,
      apiBaseUrl: parsed.data.apiBaseUrl,
    });
    window.location.replace("/");
  }, [apiBaseUrl, slug]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-sidebar px-4">
        <section className="w-full max-w-md rounded-lg border bg-background p-6 shadow-sm">
          <h1 className="text-xl font-semibold">Cannot open notebook</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button asChild className="mt-5">
            <Link href="/">Open Orion</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <section className="flex items-center gap-3 rounded-lg border bg-background p-5 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <div>
          <h1 className="font-medium">Opening Orion</h1>
          <p className="text-sm text-muted-foreground">
            Preparing this published notebook for import...
          </p>
        </div>
      </section>
    </main>
  );
}
