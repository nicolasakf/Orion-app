import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: vi.fn() }),
}));

import {
  CONNECT_TOOLS_CHAT_MESSAGE,
  PersonalContextInterview,
} from "@/components/personal-context-interview";
import { SettingsProvider } from "@/components/settings/settings-provider";
import {
  INSERT_CHAT_MESSAGE_EVENT,
  type InsertChatMessageDetail,
} from "@/lib/chat/chat-composer-events";
import { createDefaultUserSettingsDocument } from "@/lib/settings/defaults";
import type { OnboardingAnswers } from "@/lib/onboarding/personal-context";

const setUserSettingsDocumentMock = vi.fn();

/** Overridden per test to control which screen onboarding resumes at. */
let savedAnswers: OnboardingAnswers;
/** Overridden per test to mark the picker as already finished. */
let stackCompletedAt: string | undefined;

vi.mock("@/lib/settings/user-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings/user-storage")>();
  return {
    ...actual,
    setUserSettingsDocument: (...args: unknown[]) =>
      setUserSettingsDocumentMock(...args),
  };
});

/** Finds a request the component issued, by URL suffix and method. */
function findRequest(suffix: string, method: string) {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
    ([input, init]) =>
      String(input).endsWith(suffix) &&
      (init as RequestInit | undefined)?.method === method,
  );
}

beforeEach(() => {
  setUserSettingsDocumentMock.mockReset();
  setUserSettingsDocumentMock.mockResolvedValue(undefined);
  const document = createDefaultUserSettingsDocument();
  document.settings.onboarding.signInStepCompleted = true;
  savedAnswers = {
    version: 1,
    companyDescription: "",
    roleDescription: "",
    helpGoal: "",
  };
  stackCompletedAt = undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/settings") && (!init || init.method === "GET")) {
        return Response.json({ status: "missing", document });
      }
      if (url.endsWith("/api/credentials")) {
        return Response.json({ credentials: {} });
      }
      if (url.endsWith("/api/onboarding/answers")) {
        return Response.json({ answers: savedAnswers });
      }
      if (url.endsWith("/api/onboarding/stack")) {
        return Response.json({
          selection: {
            version: 1,
            categories: {},
            ...(stackCompletedAt ? { completedAt: stackCompletedAt } : {}),
            updatedAt: new Date().toISOString(),
          },
        });
      }
      if (url.endsWith("/api/onboarding/profile/generate")) {
        return Response.json({ saved: true });
      }
      return Response.json({}, { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PersonalContextInterview", () => {
  it("opens on the three questions and saves them on Next", async () => {
    render(
      <SettingsProvider>
        <PersonalContextInterview allowSkip />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("What does your company do?")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText("What does your company do?"), {
      target: { value: "We sell wholesale coffee." },
    });
    fireEvent.change(screen.getByLabelText("What kind of work do you do?"), {
      target: { value: "Finance and reporting." },
    });
    fireEvent.change(
      screen.getByLabelText("What would you most like Orion to help with?"),
      { target: { value: "Monthly margin reports." } },
    );
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));

    await waitFor(() => {
      const put = findRequest("/api/onboarding/answers", "PUT");
      expect(put).toBeDefined();
      const body = JSON.parse(String((put?.[1] as RequestInit).body));
      expect(body).toMatchObject({
        companyDescription: "We sell wholesale coffee.",
        roleDescription: "Finance and reporting.",
        helpGoal: "Monthly margin reports.",
      });
    });
  });

  it("moves to the tool picker, then generates the profile", async () => {
    render(
      <SettingsProvider>
        <PersonalContextInterview />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("What does your company do?")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /Slack/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Slack/ }));

    await waitFor(() => {
      const put = findRequest("/api/onboarding/stack", "PUT");
      expect(put).toBeDefined();
      const body = JSON.parse(String((put?.[1] as RequestInit).body));
      expect(body.categories.communication.toolIds).toEqual(["slack"]);
    });

    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));

    await waitFor(() => {
      expect(findRequest("/api/onboarding/profile/generate", "POST")).toBeDefined();
    });
    await waitFor(() => {
      expect(
        screen.getByText("Want Orion to help connect your tools?"),
      ).toBeInTheDocument();
    });
  });

  it("resumes at the tool picker when the questions are already answered", async () => {
    savedAnswers = { ...savedAnswers, updatedAt: new Date().toISOString() };
    render(
      <SettingsProvider>
        <PersonalContextInterview />
      </SettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: /Slack/ })).toBeInTheDocument();
    });
    expect(
      screen.queryByLabelText("What does your company do?"),
    ).not.toBeInTheDocument();
  });

  it("starts the tool-connection chat when the user opts in", async () => {
    savedAnswers = { ...savedAnswers, updatedAt: new Date().toISOString() };
    stackCompletedAt = new Date().toISOString();
    const submitted: InsertChatMessageDetail[] = [];
    const listener = (event: Event) => {
      submitted.push((event as CustomEvent<InsertChatMessageDetail>).detail);
    };
    window.addEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);

    try {
      render(
        <SettingsProvider>
          <PersonalContextInterview />
        </SettingsProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Yes, help me connect" }),
        ).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Yes, help me connect" }));

      await waitFor(() => {
        expect(setUserSettingsDocumentMock).toHaveBeenCalled();
      });
      const savedDocument = setUserSettingsDocumentMock.mock.calls.at(-1)?.[0];
      expect(savedDocument.settings.onboarding.businessProfileStepCompleted).toBe(true);

      await waitFor(() => {
        expect(submitted).toContainEqual({
          message: CONNECT_TOOLS_CHAT_MESSAGE,
          submit: true,
        });
      });
    } finally {
      window.removeEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    }
  });

  it("finishes without a chat when the user defers, and lets first-run users skip", async () => {
    savedAnswers = { ...savedAnswers, updatedAt: new Date().toISOString() };
    stackCompletedAt = new Date().toISOString();
    const submitted: InsertChatMessageDetail[] = [];
    const listener = (event: Event) => {
      submitted.push((event as CustomEvent<InsertChatMessageDetail>).detail);
    };
    window.addEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);

    try {
      render(
        <SettingsProvider>
          <PersonalContextInterview allowSkip />
        </SettingsProvider>,
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "I’ll do it later" }),
        ).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "I’ll do it later" }));

      await waitFor(() => {
        expect(setUserSettingsDocumentMock).toHaveBeenCalled();
      });
      const savedDocument = setUserSettingsDocumentMock.mock.calls.at(-1)?.[0];
      expect(savedDocument.settings.onboarding.businessProfileStepCompleted).toBe(true);
      expect(submitted).toHaveLength(0);
    } finally {
      window.removeEventListener(INSERT_CHAT_MESSAGE_EVENT, listener);
    }
  });
});
