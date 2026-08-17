"use client";

import * as React from "react";
import type { UIMessage } from "ai";

import {
  EMPTY_APPENDED_ESTIMATE,
  EMPTY_DRAFT_ESTIMATE,
  resolveContextUsage,
  type ContextMeasurement,
  type ContextUsageView,
} from "@/lib/agent/context-usage";
import { estimateAppendedTokens, estimateDraftTokens } from "@/lib/agent/token-budget";
import { parseChatMessageContextUsage } from "@/lib/chat/chat-references";

/**
 * "idle"        — nothing to measure yet (empty chat).
 * "measuring"   — no anchor yet, or an anchor exists and a refresh is in flight.
 * "measured"    — the displayed number rests on a current server measurement.
 * "unavailable" — measurement failed; any displayed number is the last known one.
 */
export type ContextUsagePhase = "idle" | "measuring" | "measured" | "unavailable";

/** Last known measurement plus the identity it was taken against. */
interface AnchorState {
  measurement: ContextMeasurement;
  /** Id of the last message the measurement covered. */
  coversThroughMessageId: string | null;
  modelKey: string;
  chatId: string | null;
  compactionEpoch: number;
}

export interface UseContextUsageOptions {
  /** Transcript currently held by the chat runtime. */
  messages: UIMessage[];
  /** Composer contents, priced locally as the delta on top of the anchor. */
  draft: {
    text: string;
    imageAttachmentCount: number;
    referenceBlockChars: number;
  };
  /**
   * Model selection key. Changing it invalidates the anchor outright: the context
   * window, the tokenizer and the learned calibration all change with the model.
   */
  modelKey: string;
  /** Chat identity. Changing it invalidates the anchor. */
  chatId: string | null;
  /** Bumped after every compaction so a pre-compaction anchor is never reused. */
  compactionEpoch: number;
  /** True while a model turn is in flight; suspends background measurement. */
  isTurnActive: boolean;
  /** Measures the transcript server-side against the real prepared prompt. */
  requestMeasurement: (
    messages: UIMessage[],
    signal: AbortSignal
  ) => Promise<ContextMeasurement>;
  debounceMs?: number;
}

export interface UseContextUsageResult {
  usage: ContextUsageView | null;
  phase: ContextUsagePhase;
  /** Installs a measurement taken outside the debounce (pre-send, post-compaction). */
  setAnchor: (measurement: ContextMeasurement) => void;
  /** Forces an immediate, non-debounced remeasure. */
  refresh: () => void;
}

/** Reads a provider-reported measurement off the most recent assistant message. */
function findProviderAnchor(
  messages: UIMessage[]
): { measurement: ContextMeasurement; coversThroughMessageId: string | null } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    const measurement = parseChatMessageContextUsage(message.metadata);
    if (!measurement) return null;
    // The measurement describes the prompt that produced this message, so it
    // covers everything up to — but not including — the message itself.
    return {
      measurement,
      coversThroughMessageId: messages[index - 1]?.id ?? null,
    };
  }
  return null;
}

/**
 * Track context usage as one server measurement plus locally priced additions.
 *
 * The displayed number never swaps between estimators and never blanks while the
 * user types. A measurement that fails leaves the previous number in place and is
 * reported through `phase`, so "we could not measure" is distinguishable from
 * "we have not measured yet" — the two were indistinguishable before, both
 * silently falling back to a second estimator with different semantics.
 *
 * The background measurement deliberately covers the transcript only. The draft is
 * always local, so typing schedules no server request at all.
 */
export function useContextUsage(options: UseContextUsageOptions): UseContextUsageResult {
  const {
    messages,
    draft,
    modelKey,
    chatId,
    compactionEpoch,
    isTurnActive,
    requestMeasurement,
    debounceMs = 300,
  } = options;

  const [anchor, setAnchorState] = React.useState<AnchorState | null>(null);
  const [phase, setPhase] = React.useState<ContextUsagePhase>("idle");

  const activeControllerRef = React.useRef<AbortController | null>(null);
  const requestVersionRef = React.useRef(0);
  const [refreshNonce, setRefreshNonce] = React.useState(0);

  const identityRef = React.useRef({ modelKey, chatId, compactionEpoch });
  identityRef.current = { modelKey, chatId, compactionEpoch };

  const lastMessageId = messages.at(-1)?.id ?? null;
  const lastMessageIdRef = React.useRef(lastMessageId);
  lastMessageIdRef.current = lastMessageId;

  /** Installs an explicit measurement and invalidates older in-flight work. */
  const setAnchor = React.useCallback((measurement: ContextMeasurement) => {
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    requestVersionRef.current += 1;
    setAnchorState({
      measurement,
      coversThroughMessageId: lastMessageIdRef.current,
      modelKey: identityRef.current.modelKey,
      chatId: identityRef.current.chatId,
      compactionEpoch: identityRef.current.compactionEpoch,
    });
    setPhase("measured");
  }, []);

  const refresh = React.useCallback(() => setRefreshNonce((value) => value + 1), []);

  // Drop the anchor outright when the identity it was measured against changes.
  // A stale window or tokenizer produces a confidently wrong number, which is
  // worse than briefly having none.
  React.useEffect(() => {
    setAnchorState((current) => {
      if (!current) return current;
      if (
        current.modelKey === modelKey &&
        current.chatId === chatId &&
        current.compactionEpoch === compactionEpoch
      ) {
        return current;
      }
      return null;
    });
  }, [modelKey, chatId, compactionEpoch]);

  // Seed from the provider count carried by the last assistant message. This is
  // the only exact number available, and it survives reload and chat switch.
  React.useEffect(() => {
    const provider = findProviderAnchor(messages);
    if (!provider) return;
    setAnchorState((current) => {
      if (
        current?.measurement.measuredAt === provider.measurement.measuredAt &&
        current.chatId === chatId
      ) {
        return current;
      }
      return {
        measurement: provider.measurement,
        coversThroughMessageId: provider.coversThroughMessageId,
        modelKey,
        chatId,
        compactionEpoch,
      };
    });
  }, [messages, modelKey, chatId, compactionEpoch]);

  const hasMessages = messages.length > 0;

  // Background measurement of the transcript. Note the dependency list contains
  // no draft state — typing must never schedule a request.
  React.useEffect(() => {
    if (!hasMessages || isTurnActive) return;

    const controller = new AbortController();
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    activeControllerRef.current = controller;

    // Deliberately does NOT clear the anchor. Blanking it here is what made the
    // old pill fall back to a second estimator on every keystroke.
    setPhase((current) => (current === "measured" ? "measured" : "measuring"));

    const isCurrent = () =>
      !controller.signal.aborted && requestVersionRef.current === requestVersion;

    const timer = window.setTimeout(() => {
      if (!isCurrent()) return;
      void requestMeasurement(messages, controller.signal)
        .then((measurement) => {
          if (!isCurrent()) return;
          setAnchorState({
            measurement,
            coversThroughMessageId: lastMessageIdRef.current,
            modelKey: identityRef.current.modelKey,
            chatId: identityRef.current.chatId,
            compactionEpoch: identityRef.current.compactionEpoch,
          });
          setPhase("measured");
        })
        .catch((error: unknown) => {
          if (!isCurrent()) return;
          // Keep the last known number rather than blanking the pill.
          setPhase("unavailable");
          console.debug("Context measurement unavailable:", error);
        });
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
      if (activeControllerRef.current === controller) {
        activeControllerRef.current = null;
      }
    };
  }, [messages, hasMessages, isTurnActive, requestMeasurement, debounceMs, refreshNonce]);

  const draftEstimate = React.useMemo(
    () =>
      draft.text.length === 0 &&
      draft.imageAttachmentCount === 0 &&
      draft.referenceBlockChars === 0
        ? EMPTY_DRAFT_ESTIMATE
        : estimateDraftTokens({
            text: draft.text,
            imageAttachmentCount: draft.imageAttachmentCount,
            referenceBlockChars: draft.referenceBlockChars,
          }),
    [draft.text, draft.imageAttachmentCount, draft.referenceBlockChars]
  );

  // Messages the anchor does not cover yet — typically the assistant reply of the
  // turn that just finished, before the next background measurement lands.
  const appendedEstimate = React.useMemo(() => {
    if (!anchor) return EMPTY_APPENDED_ESTIMATE;
    if (anchor.coversThroughMessageId === lastMessageId) return EMPTY_APPENDED_ESTIMATE;

    const coveredIndex = anchor.coversThroughMessageId
      ? messages.findIndex((message) => message.id === anchor.coversThroughMessageId)
      : -1;
    // An unrecognised boundary means the transcript was rewritten under us; the
    // anchor is reported stale rather than having a guessed tail added to it.
    if (anchor.coversThroughMessageId && coveredIndex === -1) return EMPTY_APPENDED_ESTIMATE;

    return estimateAppendedTokens(messages.slice(coveredIndex + 1));
  }, [anchor, messages, lastMessageId]);

  const usage = React.useMemo(() => {
    if (!anchor) return null;
    return resolveContextUsage({
      anchor: anchor.measurement,
      appended: appendedEstimate,
      draft: draftEstimate,
      isStale:
        anchor.coversThroughMessageId !== lastMessageId ||
        anchor.compactionEpoch !== compactionEpoch,
    });
  }, [anchor, appendedEstimate, draftEstimate, lastMessageId, compactionEpoch]);

  const resolvedPhase: ContextUsagePhase = !hasMessages
    ? "idle"
    : anchor
      ? phase
      : phase === "unavailable"
        ? "unavailable"
        : "measuring";

  return { usage, phase: resolvedPhase, setAnchor, refresh };
}
