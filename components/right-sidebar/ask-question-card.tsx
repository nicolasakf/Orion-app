"use client";

import * as React from "react";
import { CircleAlert, Loader2, MessageCircleQuestion, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceLabel,
  QuestionnaireChoiceShortcut,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire";
import {
  AskQuestionResultSchema,
  parseAskQuestionInput,
  type AskQuestionAnswer,
  type AskQuestionItem,
  type AskQuestionResult,
} from "@/lib/agent/ask-question";
import { cn } from "@/lib/utils";

interface AskQuestionCardProps {
  toolCallId: string;
  /** Raw tool arguments as streamed from the model. */
  input: unknown;
  /** Raw tool result once the user has answered or dismissed. */
  output?: unknown;
  state: string;
  /** Effective `agent.execution.maxQuestionsPerAsk`. */
  maxQuestions: number;
  busy?: boolean;
  onSubmit?: (toolCallId: string, result: AskQuestionResult) => void;
  onDismiss?: (toolCallId: string) => void;
}

/** Mirrored selections for one question, tracked outside the primitive. */
interface QuestionDraft {
  selected: string[];
  custom: string;
  skipped: boolean;
}

/** Stable form field name for a question at a given position. */
function itemName(index: number): string {
  return `question-${index}`;
}

/** Every answer value the user gave for one question, in display order. */
function answerValues(answer: AskQuestionAnswer): string[] {
  const values = [...answer.selected];
  const custom = answer.custom.trim();
  if (custom) values.push(custom);
  return values;
}

/** Compact header shared by every state of the card. */
function AskQuestionHeader({
  title,
  subtitle,
  busy,
  onDismiss,
}: {
  title: string;
  subtitle: string;
  busy?: boolean;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <MessageCircleQuestion className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={onDismiss}
          aria-label="Dismiss questions"
          className="size-6 shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
        >
          <X />
        </Button>
      ) : null}
    </div>
  );
}

/** Placeholder shown while the model is still streaming its questions. */
function AskQuestionWritingCard() {
  return (
    <Card
      className="relative overflow-hidden border-primary/20 bg-card shadow-none"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-primary/[0.08] to-transparent" />
      <div className="relative">
        <AskQuestionHeader
          title="Preparing questions…"
          subtitle="Orion needs a decision before it continues."
          busy
        />
      </div>
      <div className="h-0.5 animate-pulse bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
    </Card>
  );
}

/** Read-only recap rendered once the questions have a result. */
function AskQuestionAnswersCard({ result }: { result: AskQuestionResult }) {
  const answered = result.answers.filter(
    (answer) => !answer.skipped && answerValues(answer).length > 0
  ).length;
  const subtitle = result.cancelled
    ? "Dismissed without answering."
    : `${answered} of ${result.answers.length} answered.`;

  return (
    <Card
      className={cn(
        "overflow-hidden bg-card shadow-none",
        result.cancelled ? "border-border bg-muted/25" : "border-primary/25"
      )}
    >
      <AskQuestionHeader title="Your answers" subtitle={subtitle} />
      {result.answers.length > 0 ? (
        <dl className="space-y-2.5 border-t border-border/60 px-4 py-3 text-sm">
          {result.answers.map((answer, index) => {
            const values = answerValues(answer);
            return (
              <div key={`${itemName(index)}-answer`} className="min-w-0">
                <dt className="text-xs leading-snug text-muted-foreground">
                  {answer.question}
                </dt>
                <dd
                  className={cn(
                    "mt-0.5 break-words leading-snug",
                    values.length === 0 && "text-muted-foreground"
                  )}
                >
                  {answer.skipped
                    ? "Skipped"
                    : values.length > 0
                      ? values.join(" · ")
                      : "No answer"}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
    </Card>
  );
}

/**
 * Terminal card for questions that ended without a usable answer set.
 *
 * Stopping the turn cancels the tool part with a plain error output, which the
 * result schema cannot parse. Without this the card would fall back to the
 * interactive form even though nothing is listening for a submission any more.
 */
function AskQuestionClosedCard({ questionCount }: { questionCount: number }) {
  return (
    <Card className="overflow-hidden border-border bg-muted/25 shadow-none">
      <AskQuestionHeader
        title={questionCount === 1 ? "Question closed" : "Questions closed"}
        subtitle="The turn ended before these were answered."
      />
    </Card>
  );
}

/** Renders the answer controls for one question. */
function AskQuestionChoices({
  question,
  index,
  onToggleChoice,
  onCustomChange,
}: {
  question: AskQuestionItem;
  index: number;
  onToggleChoice: (index: number, value: string, checked: boolean) => void;
  onCustomChange: (index: number, value: string) => void;
}) {
  return (
    <QuestionnaireChoices>
      {question.suggestions.map((suggestion) => (
        <QuestionnaireChoice
          key={`${itemName(index)}-${suggestion}`}
          value={suggestion}
          onChange={(event) =>
            onToggleChoice(index, suggestion, event.target.checked)
          }
        >
          <QuestionnaireChoiceLabel>{suggestion}</QuestionnaireChoiceLabel>
          <QuestionnaireChoiceShortcut />
        </QuestionnaireChoice>
      ))}
      {question.allowCustomAnswer || question.suggestions.length === 0 ? (
        <QuestionnaireInput
          placeholder={
            question.suggestions.length === 0
              ? "Type your answer"
              : "Or type your own answer"
          }
          onChange={(event) => onCustomChange(index, event.target.value)}
        />
      ) : null}
    </QuestionnaireChoices>
  );
}

/**
 * Embedded questionnaire for the `ask_question` tool.
 *
 * Answers are mirrored out of the primitive's change events rather than read
 * back from the form on submit: a question that offers suggestions *and* a
 * free-text field puts both controls under one field name, so `FormData` alone
 * cannot say which part of an answer was picked and which was typed.
 */
export function AskQuestionCard({
  toolCallId,
  input,
  output,
  state,
  maxQuestions,
  busy = false,
  onSubmit,
  onDismiss,
}: AskQuestionCardProps) {
  const draftsRef = React.useRef<Map<number, QuestionDraft>>(new Map());

  /** Reads (creating if needed) the mirrored draft for one question. */
  const getDraft = React.useCallback((index: number): QuestionDraft => {
    const existing = draftsRef.current.get(index);
    if (existing) return existing;
    const created: QuestionDraft = { selected: [], custom: "", skipped: false };
    draftsRef.current.set(index, created);
    return created;
  }, []);

  /** Mirrors a radio/checkbox change; radios replace the previous selection. */
  const handleToggleChoice = React.useCallback(
    (index: number, value: string, checked: boolean, allowMultiple: boolean) => {
      const draft = getDraft(index);
      if (!allowMultiple) {
        draft.selected = checked ? [value] : [];
        return;
      }
      draft.selected = checked
        ? [...draft.selected.filter((entry) => entry !== value), value]
        : draft.selected.filter((entry) => entry !== value);
    },
    [getDraft]
  );

  /** Mirrors the free-text field for one question. */
  const handleCustomChange = React.useCallback(
    (index: number, value: string) => {
      getDraft(index).custom = value;
    },
    [getDraft]
  );

  // Tool arguments are incomplete while they stream, so validating them here
  // would flash the malformed-input card on every chunk.
  const parsedInput =
    state === "input-streaming" ? null : parseAskQuestionInput(input, maxQuestions);
  const parsedOutput = AskQuestionResultSchema.safeParse(output);

  /** Collects the mirrored drafts into the tool result and submits it. */
  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!parsedInput || busy) return;

      const answers: AskQuestionAnswer[] = parsedInput.questions.map(
        (question, index) => {
          const draft = draftsRef.current.get(index);
          const skipped = draft?.skipped ?? false;
          return {
            question: question.question,
            selected: skipped ? [] : (draft?.selected ?? []),
            custom: skipped ? "" : (draft?.custom ?? ""),
            skipped,
          };
        }
      );
      onSubmit?.(toolCallId, { answers });
    },
    [busy, onSubmit, parsedInput, toolCallId]
  );

  if (state === "input-streaming") return <AskQuestionWritingCard />;

  if (parsedOutput.success) {
    return <AskQuestionAnswersCard result={parsedOutput.data} />;
  }

  // A cancelled or errored tool part carries an output the result schema cannot
  // read, and nothing is waiting on a submission any more.
  if (
    state === "output-available" ||
    state === "output-error" ||
    state === "output-denied"
  ) {
    return (
      <AskQuestionClosedCard
        questionCount={parsedInput?.questions.length ?? 1}
      />
    );
  }

  if (!parsedInput) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 p-4 shadow-none">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Invalid questions</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Orion sent questions that could not be displayed. Dismiss them and answer
              in the composer instead.
            </p>
          </div>
        </div>
        {onDismiss ? (
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onDismiss(toolCallId)}
            >
              Dismiss
            </Button>
          </div>
        ) : null}
      </Card>
    );
  }

  const questionCount = parsedInput.questions.length;

  return (
    <Card className="overflow-hidden border-primary/25 bg-card shadow-none">
      <AskQuestionHeader
        title={questionCount === 1 ? "Orion has a question" : "Orion has some questions"}
        subtitle="Your answers go straight back to the agent."
        busy={busy}
        onDismiss={onDismiss ? () => onDismiss(toolCallId) : undefined}
      />
      <div className="border-t border-border/60 px-4 pb-3 pt-3">
        <Questionnaire shortcuts="numbers" onSubmit={handleSubmit}>
          {questionCount > 1 ? <QuestionnaireProgress /> : null}
          {parsedInput.questions.map((question, index) => (
            <QuestionnaireItem
              key={itemName(index)}
              name={itemName(index)}
              required={question.required}
              multiple={question.allowMultiple && question.suggestions.length > 0}
              onStatusChange={(status) => {
                getDraft(index).skipped = status === "skipped";
              }}
            >
              <QuestionnaireTitle>{question.question}</QuestionnaireTitle>
              {question.context ? (
                <QuestionnaireDescription>{question.context}</QuestionnaireDescription>
              ) : null}
              <AskQuestionChoices
                question={question}
                index={index}
                onToggleChoice={(choiceIndex, value, checked) =>
                  handleToggleChoice(
                    choiceIndex,
                    value,
                    checked,
                    question.allowMultiple
                  )
                }
                onCustomChange={handleCustomChange}
              />
              <QuestionnaireError />
            </QuestionnaireItem>
          ))}
          <QuestionnaireActions>
            <QuestionnairePrevious disabled={busy} />
            <QuestionnaireSkip disabled={busy} />
            <QuestionnaireNext disabled={busy} />
            <QuestionnaireSubmit disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Send answers
            </QuestionnaireSubmit>
          </QuestionnaireActions>
        </Questionnaire>
      </div>
    </Card>
  );
}
