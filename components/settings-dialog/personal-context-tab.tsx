"use client";

import * as React from "react";
import { Loader2, MessageCircle, Pencil, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { PersonalContextInterview } from "@/components/personal-context-interview";
import { SettingsInfoSectionTitle } from "@/components/settings-dialog/settings-info-label";
import { SettingsSectionLayout } from "@/components/settings-dialog/settings-section-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MAX_PERSONAL_CONTEXT_CHARS } from "@/lib/onboarding/personal-context";

const ProfileResponseSchema = z.object({
  content: z.string(),
  exists: z.boolean(),
  updatedAt: z.string().optional(),
  truncated: z.boolean(),
  blockedForModel: z.boolean(),
});

const ErrorResponseSchema = z.object({ message: z.string().optional() });

type PersonalContextView = "summary" | "edit" | "interview";

/** Reads a useful message from a failed personal-context API response. */
async function readError(response: Response, fallback: string): Promise<string> {
  const parsed = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success && parsed.data.message ? parsed.data.message : fallback;
}

/** Settings surface for editing `ORION.md` or resuming its guided interview. */
export function PersonalContextTab() {
  const [view, setView] = React.useState<PersonalContextView>("summary");
  const [content, setContent] = React.useState("");
  const [exists, setExists] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState<string | undefined>();
  const [truncated, setTruncated] = React.useState(false);
  const [blockedForModel, setBlockedForModel] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);

  /** Reloads the local personal-context file after interview or editor changes. */
  const loadProfile = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/onboarding/profile");
      if (!response.ok) {
        throw new Error(await readError(response, "Could not load personal context."));
      }
      const result = ProfileResponseSchema.parse(await response.json());
      setContent(result.content);
      setExists(result.exists);
      setUpdatedAt(result.updatedAt);
      setTruncated(result.truncated);
      setBlockedForModel(result.blockedForModel);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load personal context.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  /** Saves direct Markdown edits to `ORION.md`. */
  const saveProfile = React.useCallback(async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/onboarding/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "Could not save personal context."));
      }
      toast.success("Personal context saved");
      await loadProfile();
      setView("summary");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save personal context.");
    } finally {
      setIsSaving(false);
    }
  }, [content, loadProfile]);

  /** Deletes the profile after an explicit confirmation. */
  const deleteProfile = React.useCallback(async () => {
    if (!window.confirm("Delete ORION.md? Your interview history will be kept.")) return;
    const response = await fetch("/api/onboarding/profile", { method: "DELETE" });
    if (!response.ok) {
      toast.error(await readError(response, "Could not delete personal context."));
      return;
    }
    toast.success("Personal context deleted");
    await loadProfile();
  }, [loadProfile]);

  /** Deletes only the resumable conversation after an explicit confirmation. */
  const clearHistory = React.useCallback(async () => {
    if (!window.confirm("Clear the personal context interview history? ORION.md will be kept.")) {
      return;
    }
    const response = await fetch("/api/onboarding/interview", { method: "DELETE" });
    if (!response.ok) {
      toast.error(await readError(response, "Could not clear interview history."));
      return;
    }
    toast.success("Interview history cleared");
  }, []);

  if (view === "interview") {
    return (
      <SettingsSectionLayout title="Personal context">
        <PersonalContextInterview
          className="min-h-[34rem]"
          onDone={() => {
            setView("summary");
            void loadProfile();
          }}
        />
      </SettingsSectionLayout>
    );
  }

  return (
    <SettingsSectionLayout title="Personal context">
      <div className="space-y-4">
        <SettingsInfoSectionTitle
          title="ORION.md"
          description="Local background Orion includes in agent conversations. It does not grant access or override safety and workspace rules."
        />

        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading personal context…
          </div>
        ) : view === "edit" ? (
          <div className="space-y-3">
            <Textarea
              aria-label="Personal context Markdown"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-80 resize-y font-mono text-xs"
              maxLength={MAX_PERSONAL_CONTEXT_CHARS}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{content.length.toLocaleString()} / {MAX_PERSONAL_CONTEXT_CHARS.toLocaleString()}</span>
              <span>Never store passwords, tokens, or API keys here.</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={isSaving} onClick={() => { setView("summary"); void loadProfile(); }}>
                Cancel
              </Button>
              <Button type="button" disabled={isSaving || !content.trim()} onClick={() => void saveProfile()}>
                {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
                Save ORION.md
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              {exists ? (
                <>
                  <p className="text-sm font-medium">Personal context is active</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Stored locally at ~/.orion/ORION.md
                    {updatedAt ? ` · Updated ${new Date(updatedAt).toLocaleString()}` : ""}
                  </p>
                  {truncated ? (
                    <p className="mt-2 text-sm text-destructive">
                      This manually edited file exceeds the 32 KiB prompt limit. Edit it to restore the full context.
                    </p>
                  ) : null}
                  {blockedForModel ? (
                    <p className="mt-2 text-sm text-destructive">
                      Orion is not sending this file to models because it appears to contain a credential or private key. Remove it before continuing.
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">No personal context saved yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Continue the guided interview or create ORION.md manually.
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => setView("interview")}>
                <MessageCircle className="mr-2 size-4" />
                Continue interview
              </Button>
              <Button type="button" variant="outline" onClick={() => setView("edit")}>
                <Pencil className="mr-2 size-4" />
                {exists ? "Edit ORION.md" : "Create ORION.md"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void clearHistory()}>
                Clear interview history
              </Button>
              {exists ? (
                <Button type="button" variant="destructive" onClick={() => void deleteProfile()}>
                  <Trash2 className="mr-2 size-4" />
                  Delete ORION.md
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </SettingsSectionLayout>
  );
}
