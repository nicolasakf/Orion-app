import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PersonalContextTab } from "@/components/settings-dialog/personal-context-tab";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OpenSettingsProvider } from "@/contexts/open-settings-context";
import { useRegisterOpenPersonalContextFile } from "@/hooks/use-register-open-personal-context-file";
import { PERSONAL_CONTEXT_EDITOR_PATH } from "@/lib/onboarding/personal-context-editor-path";

const onOpenFile = vi.fn();

/** Registers the same editor-open handler the main page uses. */
function RegisterOpenPersonalContextFile() {
  useRegisterOpenPersonalContextFile({ onOpenFile });
  return null;
}

beforeEach(() => {
  onOpenFile.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/onboarding/profile")) {
        return Response.json({
          content: "# Orion User Context\n",
          exists: true,
          updatedAt: "2026-08-21T15:00:00.000Z",
          truncated: false,
          blockedForModel: false,
        });
      }
      return Response.json({}, { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PersonalContextTab", () => {
  it("opens ORION.md in the editor and closes settings", async () => {
    render(
      <TooltipProvider>
        <OpenSettingsProvider>
          <RegisterOpenPersonalContextFile />
          <PersonalContextTab />
        </OpenSettingsProvider>
      </TooltipProvider>,
    );

    const editButton = await screen.findByRole("button", { name: "Edit ORION.md" });
    fireEvent.click(editButton);

    await waitFor(() => {
      expect(onOpenFile).toHaveBeenCalledWith({
        name: "ORION.md",
        path: PERSONAL_CONTEXT_EDITOR_PATH,
      });
    });
  });
});
