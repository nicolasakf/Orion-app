"use client";

import * as React from "react";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { FolderOpen, Loader2, RotateCcw, Send, Square } from "lucide-react";
import { z } from "zod";

import { ChatMarkdownRenderer } from "@/components/right-sidebar/chat-markdown-renderer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { openNativeProjectFolderPicker } from "@/lib/local/project-folder-picker.client";
import {
  InterviewTranscriptSchema,
  MAX_PERSONAL_CONTEXT_CHARS,
} from "@/lib/onboarding/personal-context";
import { cn } from "@/lib/utils";

const InterviewResponseSchema = z.object({
  transcript: InterviewTranscriptSchema,
});

const DraftResponseSchema = z.object({
  draft: z.string().max(MAX_PERSONAL_CONTEXT_CHARS),
});

const ErrorResponseSchema = z.object({ message: z.string().optional() });

const STARTER_MESSAGE = {
  id: "personal-context-welcome",
  role: "assistant" as const,
  parts: [
    {
      type: "text" as const,
      text: "I’ll help Orion understand your work and where your data lives. Please don’t share passwords, tokens, or API keys—only describe where access is configured. To start, what kind of work do you do, and what would you most like Orion to help with?",
    },
  ],
};

interface PersonalContextInterviewProps {
  /** Shows the first-run skip action and marks onboarding complete when used. */
  allowSkip?: boolean;
  /** Called after a successful save or first-run skip. */
  onDone?: () => void;
  className?: string;
}

/** Reads the clearest error message from a local onboarding API response. */
async function readApiError(response: Response, fallback: string): Promise<string> {
  const parsed = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success && parsed.data.message ? parsed.data.message : fallback;
}

/** Guided ChatGPT interview with explicit review before writing `ORION.md`. */
export function PersonalContextInterview({
  allowSkip = false,
  onDone,
  className,
}: PersonalContextInterviewProps) {
  const { setUserSettings } = useOrionSettings();
  const [input, setInput] = React.useState("");
  const [isLoadingHistory, setIsLoadingHistory] = React.useState(true);
  const [isGeneratingDraft, setIsGeneratingDraft] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isChoosingFolder, setIsChoosingFolder] = React.useState(false);
  const [draft, setDraft] = React.useState<string | null>(null);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const messageEndRef = React.useRef<HTMLDivElement | null>(null);
  const transport = React.useMemo(
    () => new DefaultChatTransport({ api: "/api/onboarding/interview" }),
    [],
  );
  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    stop,
    regenerate,
  } = useChat({ transport, experimental_throttle: 50 });
  const isGenerating = status === "submitted" || status === "streaming";

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/api/onboarding/interview")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await readApiError(response, "Could not load the interview transcript."),
          );
        }
        return InterviewResponseSchema.parse(await response.json());
      })
      .then(({ transcript }) => {
        if (cancelled) return;
        setMessages(
          transcript.messages.length > 0
            ? transcript.messages.map((message) => ({
                id: message.id,
                role: message.role,
                parts: [{ type: "text" as const, text: message.content }],
              }))
            : [STARTER_MESSAGE],
        );
      })
      .catch((loadError) => {
        if (!cancelled) {
          setLocalError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load the interview transcript.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setMessages]);

  React.useEffect(() => {
    if (typeof messageEndRef.current?.scrollIntoView === "function") {
      messageEndRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [messages, status]);

  /** Marks the Business interview step as dismissed or completed. */
  const completeBusinessProfileStep = React.useCallback(async () => {
    await setUserSettings((current) => ({
      ...current,
      onboarding: {
        ...current.onboarding,
        businessProfileStepCompleted: true,
      },
    }));
  }, [setUserSettings]);

  /** Sends one text-only interview answer. */
  const submitText = React.useCallback(
    async (text: string) => {
      const normalized = text.trim();
      if (!normalized || isGenerating) return;
      setLocalError(null);
      setInput("");
      await sendMessage({ text: normalized });
    },
    [isGenerating, sendMessage],
  );

  /** Adds a folder selected through Orion's validated local project picker. */
  const chooseLocalFolder = React.useCallback(async () => {
    setIsChoosingFolder(true);
    setLocalError(null);
    try {
      const selection = await openNativeProjectFolderPicker();
      if (!selection) return;
      await submitText(
        `Validated local data folder: ${selection.name} (Jupyter-root-relative path: ${selection.path || "."}).`,
      );
    } catch (folderError) {
      setLocalError(
        folderError instanceof Error
          ? folderError.message
          : "Could not choose that local folder.",
      );
    } finally {
      setIsChoosingFolder(false);
    }
  }, [submitText]);

  /** Generates a full editable replacement draft from the saved transcript. */
  const reviewProfile = React.useCallback(async () => {
    setIsGeneratingDraft(true);
    setLocalError(null);
    try {
      const response = await fetch("/api/onboarding/interview/draft", {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Could not generate a personal context draft."),
        );
      }
      const result = DraftResponseSchema.parse(await response.json());
      setDraft(result.draft);
    } catch (draftError) {
      setLocalError(
        draftError instanceof Error
          ? draftError.message
          : "Could not generate a personal context draft.",
      );
    } finally {
      setIsGeneratingDraft(false);
    }
  }, []);

  /** Saves the reviewed draft and completes first-run onboarding. */
  const saveDraft = React.useCallback(async () => {
    if (draft === null) return;
    setIsSaving(true);
    setLocalError(null);
    try {
      const response = await fetch("/api/onboarding/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (!response.ok) {
        throw new Error(
          await readApiError(response, "Could not save your personal context."),
        );
      }
      await completeBusinessProfileStep();
      onDone?.();
    } catch (saveError) {
      setLocalError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save your personal context.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [completeBusinessProfileStep, draft, onDone]);

  /** Skips first-run collection while leaving Settings available later. */
  const skipInterview = React.useCallback(async () => {
    setIsSaving(true);
    setLocalError(null);
    try {
      await completeBusinessProfileStep();
      onDone?.();
    } catch (skipError) {
      setLocalError(
        skipError instanceof Error ? skipError.message : "Could not skip the interview.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [completeBusinessProfileStep, onDone]);

  if (draft !== null) {
    return (
      <div className={cn("flex min-h-0 flex-col gap-4", className)}>
        <div>
          <h3 className="text-base font-semibold">Review your personal context</h3>
          <p className="text-sm text-muted-foreground">
            Edit anything below. Orion writes this file only after you save it.
          </p>
        </div>
        <Textarea
          aria-label="Personal context draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-h-72 flex-1 resize-none font-mono text-xs"
          maxLength={MAX_PERSONAL_CONTEXT_CHARS}
        />
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{draft.length.toLocaleString()} / {MAX_PERSONAL_CONTEXT_CHARS.toLocaleString()}</span>
          <span>Do not include passwords, tokens, or API keys.</span>
        </div>
        {localError ? <p className="text-sm text-destructive">{localError}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={() => setDraft(null)}>
            Back to interview
          </Button>
          <Button type="button" disabled={isSaving || draft.trim().length === 0} onClick={() => void saveDraft()}>
            {isSaving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save to ORION.md
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-col gap-4", className)}>
      <div className="min-h-64 flex-1 space-y-4 overflow-y-auto rounded-lg border bg-muted/20 p-4">
        {isLoadingHistory ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Loading your interview…
          </div>
        ) : (
          messages.map((message) => {
            const content = message.parts
              .filter((part): part is { type: "text"; text: string } => part.type === "text")
              .map((part) => part.text)
              .join("");
            return (
              <div
                key={message.id}
                className={cn(
                  "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto border bg-background",
                )}
              >
                {message.role === "assistant" ? (
                  <ChatMarkdownRenderer source={content} fontSize={13} />
                ) : (
                  <p className="whitespace-pre-wrap">{content}</p>
                )}
              </div>
            );
          })
        )}
        <div ref={messageEndRef} />
      </div>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submitText(input);
        }}
      >
        <Textarea
          aria-label="Interview answer"
          value={input}
          disabled={isLoadingHistory || isGenerating}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submitText(input);
            }
          }}
          placeholder="Tell Orion about your work, goals, or data…"
          className="min-h-20 resize-none"
          maxLength={4_000}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isChoosingFolder || isGenerating}
            onClick={() => void chooseLocalFolder()}
          >
            {isChoosingFolder ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FolderOpen className="mr-2 size-4" />}
            Choose local data folder
          </Button>
          {isGenerating ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void stop()}>
              <Square className="mr-2 size-3 fill-current" />
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!input.trim() || isLoadingHistory}>
              <Send className="mr-2 size-4" />
              Send
            </Button>
          )}
        </div>
      </form>

      {(localError ?? error?.message) ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{localError ?? error?.message}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void regenerate()}>
            <RotateCcw className="mr-2 size-4" />
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        {allowSkip ? (
          <Button type="button" variant="ghost" disabled={isSaving || isGenerating} onClick={() => void skipInterview()}>
            Skip for now
          </Button>
        ) : <span />}
        <Button type="button" disabled={isGeneratingDraft || isGenerating || isLoadingHistory} onClick={() => void reviewProfile()}>
          {isGeneratingDraft ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Review profile
        </Button>
      </div>
    </div>
  );
}
