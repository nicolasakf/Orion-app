"use client";

import * as React from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { SettingsInfoSectionTitle } from "@/components/settings-dialog/settings-info-label";
import { SettingsSectionLayout } from "@/components/settings-dialog/settings-section-layout";
import { Button } from "@/components/ui/button";
import { useOpenSettings } from "@/contexts/open-settings-context";
import { PERSONAL_CONTEXT_FILE_CHANGED_EVENT } from "@/lib/onboarding/personal-context-editor-path";

const ProfileResponseSchema = z.object({
  content: z.string(),
  exists: z.boolean(),
  updatedAt: z.string().optional(),
  truncated: z.boolean(),
  blockedForModel: z.boolean(),
});

const ErrorResponseSchema = z.object({ message: z.string().optional() });

/** Reads a useful message from a failed personal-context API response. */
async function readError(response: Response, fallback: string): Promise<string> {
  const parsed = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success && parsed.data.message ? parsed.data.message : fallback;
}

/** Settings surface for reviewing or deleting `ORION.md`, and opening it in the editor. */
export function PersonalContextTab() {
  const { openPersonalContextFile, onOpenChange } = useOpenSettings();
  const [exists, setExists] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState<string | undefined>();
  const [truncated, setTruncated] = React.useState(false);
  const [blockedForModel, setBlockedForModel] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  /** Reloads the local personal-context file after interview or editor changes. */
  const loadProfile = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/onboarding/profile");
      if (!response.ok) {
        throw new Error(await readError(response, "Could not load personal context."));
      }
      const result = ProfileResponseSchema.parse(await response.json());
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

  /** Opens `ORION.md` in the main editor and closes settings. */
  const openInEditor = React.useCallback(() => {
    openPersonalContextFile();
    onOpenChange(false);
  }, [onOpenChange, openPersonalContextFile]);

  /** Deletes the profile after an explicit confirmation. */
  const deleteProfile = React.useCallback(async () => {
    if (!window.confirm("Delete ORION.md? Your interview history will be kept.")) return;
    const response = await fetch("/api/onboarding/profile", { method: "DELETE" });
    if (!response.ok) {
      toast.error(await readError(response, "Could not delete personal context."));
      return;
    }
    toast.success("Personal context deleted");
    window.dispatchEvent(new CustomEvent(PERSONAL_CONTEXT_FILE_CHANGED_EVENT));
    await loadProfile();
  }, [loadProfile]);

  return (
    <SettingsSectionLayout title="Personal context">
      <div className="space-y-4">
        <SettingsInfoSectionTitle
          title="ORION.md"
          description="Local background Orion includes in agent conversations. Ask Orion in chat to remember something and it updates this file itself. It does not grant access or override safety and workspace rules."
        />

        {isLoading ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading personal context…
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
                    Create ORION.md in the editor, or ask Orion in chat to remember something.
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={openInEditor}>
                <Pencil className="mr-2 size-4" />
                {exists ? "Edit ORION.md" : "Create ORION.md"}
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
