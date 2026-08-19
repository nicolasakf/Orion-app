"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { z } from "zod";

import { BusinessStackPicker } from "@/components/onboarding/business-stack-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { dispatchSubmitChatMessage } from "@/lib/chat/chat-composer-events";
import {
  BusinessStackSelectionSchema,
  countAnsweredCategories,
  createEmptyBusinessStackSelection,
  type BusinessStackSelection,
} from "@/lib/onboarding/business-tools";
import {
  createEmptyOnboardingAnswers,
  MAX_ONBOARDING_ANSWER_CHARS,
  OnboardingAnswersSchema,
  type OnboardingAnswers,
} from "@/lib/onboarding/personal-context";
import { cn } from "@/lib/utils";

const AnswersResponseSchema = z.object({
  answers: OnboardingAnswersSchema,
});

const StackResponseSchema = z.object({
  selection: BusinessStackSelectionSchema,
});

const ErrorResponseSchema = z.object({ message: z.string().optional() });

/** The message that opens the tool-connection chat when the user opts in. */
export const CONNECT_TOOLS_CHAT_MESSAGE = "help me setup my tools";

/** The three questions, in the order they are asked. */
const QUESTIONS: {
  key: keyof Pick<
    OnboardingAnswers,
    "companyDescription" | "roleDescription" | "helpGoal"
  >;
  label: string;
  placeholder: string;
}[] = [
  {
    key: "companyDescription",
    label: "What does your company do?",
    placeholder: "What you sell, who buys it, and roughly how big the team is.",
  },
  {
    key: "roleDescription",
    label: "What kind of work do you do?",
    placeholder: "Your role and the work that fills most of your week.",
  },
  {
    key: "helpGoal",
    label: "What would you most like Orion to help with?",
    placeholder: "The reporting, analysis, or busywork you would hand off first.",
  },
];

/**
 * `questions` collects the three answers, `stack` picks the tools, `generating`
 * writes `ORION.md`, and `connect` offers the hand-off into a chat.
 */
type OnboardingPhase = "loading" | "questions" | "stack" | "generating" | "connect";

interface PersonalContextInterviewProps {
  /** Shows the first-run skip action and marks onboarding complete when used. */
  allowSkip?: boolean;
  /** Called after a successful finish or first-run skip. */
  onDone?: () => void;
  className?: string;
}

/** Reads the clearest error message from a local onboarding API response. */
async function readApiError(response: Response, fallback: string): Promise<string> {
  const parsed = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
  return parsed.success && parsed.data.message ? parsed.data.message : fallback;
}

/**
 * Business onboarding: three questions, then the tool picker, then a generated
 * `ORION.md`. It is asked once — later changes go through the agent's
 * `update_memory` tool rather than a second pass through this form.
 */
export function PersonalContextInterview({
  allowSkip = false,
  onDone,
  className,
}: PersonalContextInterviewProps) {
  const { setUserSettings } = useOrionSettings();
  const [phase, setPhase] = React.useState<OnboardingPhase>("loading");
  const [answers, setAnswers] = React.useState<OnboardingAnswers>(createEmptyOnboardingAnswers);
  const [stack, setStack] = React.useState<BusinessStackSelection>(
    createEmptyBusinessStackSelection,
  );
  const [isFinishing, setIsFinishing] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    /** Restores both halves of onboarding and resumes at the right screen. */
    async function restore(): Promise<void> {
      const [answersResponse, stackResponse] = await Promise.all([
        fetch("/api/onboarding/answers"),
        fetch("/api/onboarding/stack"),
      ]);
      if (!answersResponse.ok) {
        throw new Error(
          await readApiError(answersResponse, "Could not load your saved answers."),
        );
      }
      if (!stackResponse.ok) {
        throw new Error(
          await readApiError(stackResponse, "Could not load your saved tool selection."),
        );
      }
      const { answers: saved } = AnswersResponseSchema.parse(await answersResponse.json());
      const { selection } = StackResponseSchema.parse(await stackResponse.json());
      if (cancelled) return;

      setAnswers(saved);
      setStack(selection);
      const stackDone =
        Boolean(selection.completedAt) || countAnsweredCategories(selection) > 0;
      setPhase(saved.updatedAt ? (stackDone ? "connect" : "stack") : "questions");
    }

    void restore().catch((loadError) => {
      if (cancelled) return;
      setLocalError(
        loadError instanceof Error ? loadError.message : "Could not load your setup.",
      );
      // Failing to restore should not trap the user on a spinner.
      setPhase("questions");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Persists the answers so a closed dialog resumes where it left off. */
  const persistAnswers = React.useCallback(async (next: OnboardingAnswers) => {
    const stamped = { ...next, updatedAt: new Date().toISOString() };
    setAnswers(stamped);
    const response = await fetch("/api/onboarding/answers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stamped),
    });
    if (!response.ok) {
      setLocalError(await readApiError(response, "Could not save your answers."));
    }
  }, []);

  /** Persists picker progress on every toggle. */
  const persistStack = React.useCallback(async (selection: BusinessStackSelection) => {
    setStack(selection);
    const response = await fetch("/api/onboarding/stack", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selection),
    });
    if (!response.ok) {
      setLocalError(await readApiError(response, "Could not save your tool selection."));
    }
  }, []);

  /** Marks the Business onboarding step as dismissed or completed. */
  const completeBusinessProfileStep = React.useCallback(async () => {
    await setUserSettings((current) => ({
      ...current,
      onboarding: {
        ...current.onboarding,
        businessProfileStepCompleted: true,
      },
    }));
  }, [setUserSettings]);

  const skipOnboarding = React.useCallback(async () => {
    setIsFinishing(true);
    setLocalError(null);
    try {
      await completeBusinessProfileStep();
      onDone?.();
    } catch (skipError) {
      setLocalError(
        skipError instanceof Error ? skipError.message : "Could not skip setup.",
      );
      setIsFinishing(false);
    }
  }, [completeBusinessProfileStep, onDone]);

  /** Generates and saves `ORION.md`, then offers the tool-connection chat. */
  const generateProfile = React.useCallback(async () => {
    setPhase("generating");
    setLocalError(null);
    const response = await fetch("/api/onboarding/profile/generate", { method: "POST" });
    if (!response.ok) {
      setLocalError(await readApiError(response, "Could not write your Orion memory."));
      return;
    }
    setPhase("connect");
  }, []);

  /**
   * Ends onboarding. When the user asks for help connecting, the chat message
   * is dispatched on the next tick so the modal unmounts before the composer
   * takes focus.
   */
  const finish = React.useCallback(
    async (options: { startChat: boolean }) => {
      setIsFinishing(true);
      setLocalError(null);
      try {
        await completeBusinessProfileStep();
        onDone?.();
        if (options.startChat) {
          setTimeout(() => dispatchSubmitChatMessage(CONNECT_TOOLS_CHAT_MESSAGE), 0);
        }
      } catch (finishError) {
        setLocalError(
          finishError instanceof Error ? finishError.message : "Could not finish setup.",
        );
        setIsFinishing(false);
      }
    },
    [completeBusinessProfileStep, onDone],
  );

  const errorBanner = localError ? (
    <p role="alert" className="text-sm text-destructive">
      {localError}
    </p>
  ) : null;

  if (phase === "loading") {
    return (
      <div
        className={cn(
          "flex min-h-64 flex-1 items-center justify-center text-sm text-muted-foreground",
          className,
        )}
      >
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading your setup…
      </div>
    );
  }

  if (phase === "questions") {
    return (
      <div className={cn("flex min-h-0 flex-col gap-4", className)}>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {QUESTIONS.map((question) => (
            <div key={question.key} className="space-y-2">
              <Label htmlFor={question.key}>{question.label}</Label>
              <Textarea
                id={question.key}
                rows={3}
                maxLength={MAX_ONBOARDING_ANSWER_CHARS}
                placeholder={question.placeholder}
                value={answers[question.key]}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.key]: event.target.value,
                  }))
                }
                onBlur={() => void persistAnswers(answers)}
              />
            </div>
          ))}
          {errorBanner}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          {allowSkip ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isFinishing}
              onClick={() => void skipOnboarding()}
            >
              Skip for now
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              await persistAnswers(answers);
              setPhase("stack");
            }}
          >
            Next
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "stack") {
    return (
      <div className={cn("flex min-h-0 flex-col gap-2", className)}>
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-2"
            onClick={() => setPhase("questions")}
          >
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Button>
        </div>
        <BusinessStackPicker
          className="min-h-0 flex-1"
          value={stack}
          onChange={(selection) => void persistStack(selection)}
          onComplete={() => {
            // Stamped even with nothing selected, so a deliberate "Next" is not
            // mistaken for an unfinished picker on the next launch.
            void persistStack({ ...stack, completedAt: new Date().toISOString() });
            void generateProfile();
          }}
          onSkipAll={allowSkip ? () => void skipOnboarding() : undefined}
        />
      </div>
    );
  }

  if (phase === "generating") {
    // A model error must not trap the user: "Continue anyway" always moves on.
    return (
      <div
        className={cn("flex min-h-64 flex-1 flex-col items-center justify-center gap-4", className)}
      >
        {localError ? (
          <>
            <p role="alert" className="max-w-md text-center text-sm text-destructive">
              {localError}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void generateProfile()}>
                Try again
              </Button>
              <Button type="button" size="sm" onClick={() => setPhase("connect")}>
                Continue anyway
              </Button>
            </div>
          </>
        ) : (
          <p className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            Writing your Orion memory…
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("flex min-h-64 flex-1 flex-col items-center justify-center gap-4", className)}
    >
      <Sparkles className="size-8 text-primary" aria-hidden />
      <div className="max-w-md space-y-2 text-center">
        <h3 className="text-base font-semibold">
          Want Orion to help connect your tools?
        </h3>
        <p className="text-sm text-muted-foreground">
          Orion can walk you through reaching the tools you picked, one at a time, and
          remember how each connection works for next time.
        </p>
      </div>
      {errorBanner}
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isFinishing}
          onClick={() => void finish({ startChat: true })}
        >
          Yes, help me connect
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isFinishing}
          onClick={() => void finish({ startChat: false })}
        >
          I&rsquo;ll do it later
        </Button>
      </div>
    </div>
  );
}
