"use client";

import * as React from "react";

import { AskQuestionCard } from "./ask-question-card";
import {
  DEFAULT_MAX_QUESTIONS_PER_ASK,
  type AskQuestionResult,
} from "@/lib/agent/ask-question";

/** Everything the questionnaire card needs from the chat that owns the tool call. */
export interface AskQuestionContextValue {
  /** Effective `agent.execution.maxQuestionsPerAsk`. */
  maxQuestions: number;
  /** Tool calls whose answers are currently being submitted. */
  busyToolCallIds: ReadonlySet<string>;
  onSubmit: (toolCallId: string, result: AskQuestionResult) => void;
  onDismiss: (toolCallId: string) => void;
}

/**
 * Chat-scoped handlers for the `ask_question` card.
 *
 * The card is rendered from deep inside the activity-grouping render helpers,
 * which are plain functions reused by several row types. A context keeps the
 * wiring at the `ChatBody` boundary instead of threading four more props
 * through every intermediate row.
 */
const AskQuestionContext = React.createContext<AskQuestionContextValue | null>(null);

export function AskQuestionProvider({
  value,
  children,
}: {
  value: AskQuestionContextValue | undefined;
  children: React.ReactNode;
}) {
  return (
    <AskQuestionContext.Provider value={value ?? null}>
      {children}
    </AskQuestionContext.Provider>
  );
}

interface AskQuestionToolCardProps {
  toolCallId: string;
  input: unknown;
  output?: unknown;
  state: string;
}

/**
 * Renders one `ask_question` tool part against the ambient chat handlers.
 *
 * Without a provider — historical transcripts in read-only views, for example —
 * the card still renders any recorded answers but offers no controls.
 */
export function AskQuestionToolCard({
  toolCallId,
  input,
  output,
  state,
}: AskQuestionToolCardProps) {
  const context = React.useContext(AskQuestionContext);

  return (
    <AskQuestionCard
      toolCallId={toolCallId}
      input={input}
      output={output}
      state={state}
      maxQuestions={context?.maxQuestions ?? DEFAULT_MAX_QUESTIONS_PER_ASK}
      busy={context?.busyToolCallIds.has(toolCallId)}
      onSubmit={context?.onSubmit}
      onDismiss={context?.onDismiss}
    />
  );
}
