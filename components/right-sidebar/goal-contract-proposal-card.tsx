"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Loader2,
  RotateCcw,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { findModelBySelectionKey } from "@/lib/agent/model-selection-key";
import {
  GoalContractProposalResultSchema,
  GoalContractSchema,
  type GoalContract,
} from "@/lib/agent/goals/types";
import { cn } from "@/lib/utils";

import { ModelCombobox } from "./model-combobox";
import type { LLM } from "./types";

interface GoalContractProposalCardProps {
  toolCallId: string;
  input: unknown;
  output?: unknown;
  state: string;
  busy?: boolean;
  error?: string;
  onApprove?: (toolCallId: string) => void;
  onRequestRevision?: (toolCallId: string) => void;
  /** Catalog and pins backing the worker and evaluator pickers. */
  models?: LLM[];
  pinnedModelIds?: string[];
  /** Model that will perform the goal work. */
  workerModel?: string;
  onWorkerModelChange?: (model: string) => void;
  /** Model that will review the work, chosen independently of the composer's. */
  evaluatorModel?: string;
  onEvaluatorModelChange?: (model: string) => void;
  onOpenModelsSettings?: () => void;
  onOpenProvidersSettings?: () => void;
}

/** Detailed contract content revealed only when the user asks to inspect it. */
function GoalContractDetails({ contract }: { contract: GoalContract }) {
  return (
    <div className="space-y-4 border-t border-border/60 px-4 py-4 text-sm">
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Objective
        </h4>
        <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{contract.objective}</p>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Deliverables
        </h4>
        <ul className="mt-1.5 space-y-2">
          {contract.deliverables.map((deliverable) => (
            <li key={deliverable.path} className="rounded-md bg-muted/50 px-3 py-2">
              <code className="break-all text-xs font-medium text-foreground">
                {deliverable.path}
              </code>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {deliverable.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Acceptance criteria
        </h4>
        <ol className="mt-1.5 space-y-2">
          {contract.acceptanceCriteria.map((criterion, index) => (
            <li key={criterion.id} className="flex gap-2 leading-relaxed">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                {index + 1}
              </span>
              <span>{criterion.description}</span>
            </li>
          ))}
        </ol>
      </section>

      {contract.constraints.length > 0 ? (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Constraints
          </h4>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
            {contract.constraints.map((constraint) => (
              <li key={constraint} className="leading-relaxed">
                {constraint}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** Compact non-validating state shown while structured tool input is still streaming. */
function GoalContractWritingCard() {
  return (
    <Card
      className="relative overflow-hidden border-primary/20 bg-card shadow-none"
      aria-live="polite"
    >
      <div className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-primary/[0.08] to-transparent" />
      <div className="relative flex items-center gap-3 px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Writing goal contract…</p>
          <p className="truncate text-xs text-muted-foreground">
            Defining measurable deliverables and acceptance criteria.
          </p>
        </div>
      </div>
      <div className="h-0.5 animate-pulse bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
    </Card>
  );
}

/** Displays an agent-authored goal contract and records the user's decision. */
export function GoalContractProposalCard({
  toolCallId,
  input,
  output,
  state,
  busy = false,
  error,
  onApprove,
  onRequestRevision,
  models,
  pinnedModelIds,
  workerModel,
  onWorkerModelChange,
  evaluatorModel,
  onEvaluatorModelChange,
  onOpenModelsSettings,
  onOpenProvidersSettings,
}: GoalContractProposalCardProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [workerPickerOpen, setWorkerPickerOpen] = React.useState(false);
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = React.useState(false);
  const workerLlm =
    models && workerModel ? findModelBySelectionKey(models, workerModel) : undefined;
  const evaluatorLlm =
    models && evaluatorModel
      ? findModelBySelectionKey(models, evaluatorModel)
      : undefined;

  // Tool arguments are incomplete by definition in this state. Validating them
  // here caused the malformed-contract card to flicker during every stream.
  if (state === "input-streaming") {
    return <GoalContractWritingCard />;
  }

  const parsedContract = GoalContractSchema.safeParse(input);
  const parsedResult = GoalContractProposalResultSchema.safeParse(output);
  const result = parsedResult.success ? parsedResult.data : null;
  const isApproved = result?.status === "approved";
  const isRevisionRequested = result?.status === "revision_requested";
  const isPending = !result && state === "input-available";
  const canChooseWorker =
    isPending && Boolean(models?.length) && Boolean(onWorkerModelChange);
  const canChooseEvaluator =
    isPending && Boolean(models?.length) && Boolean(onEvaluatorModelChange);

  if (!parsedContract.success) {
    const canRequestRevision = state === "input-available";
    return (
      <Card className="border-destructive/40 bg-destructive/5 p-4 shadow-none">
        <div className="flex items-start gap-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Invalid goal contract</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The contract author returned malformed structured data. Add instructions in the
              composer to ask for a corrected proposal.
            </p>
          </div>
        </div>
        {canRequestRevision ? (
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onRequestRevision?.(toolCallId)}
            >
              No, do it differently
            </Button>
          </div>
        ) : null}
      </Card>
    );
  }

  const contract = parsedContract.data;

  return (
    <Card
      className={cn(
        "overflow-hidden border-primary/25 bg-card shadow-none",
        isApproved && "border-emerald-500/35 bg-emerald-500/[0.03]",
        isRevisionRequested && "border-border bg-muted/25",
      )}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Target className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Proposed goal contract</p>
            <p className="text-xs text-muted-foreground">
              {isPending
                ? "Ready for your approval."
                : "The worker and supervisor were measured against this contract."}
            </p>
          </div>
        </div>
        {isApproved ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Approved
          </span>
        ) : isRevisionRequested ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5" /> Revision requested
          </span>
        ) : null}
      </div>

      {expanded ? <GoalContractDetails contract={contract} /> : null}

      {error ? (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3">
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 px-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Show more"}
          {expanded ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
        </button>

        {canChooseWorker || canChooseEvaluator ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {canChooseWorker ? (
              <div className="flex min-w-0 items-center gap-1">
                <span className="shrink-0">Worker</span>
                <ModelCombobox
                  models={models ?? []}
                  pinnedModelIds={pinnedModelIds ?? []}
                  selectedModel={workerModel ?? ""}
                  onModelChange={onWorkerModelChange!}
                  open={workerPickerOpen}
                  onOpenChange={setWorkerPickerOpen}
                  disabled={busy}
                  onOpenModelsSettings={onOpenModelsSettings}
                  onOpenProvidersSettings={onOpenProvidersSettings}
                  placeholder="Choose worker"
                />
              </div>
            ) : null}
            {canChooseEvaluator ? (
              <div className="flex min-w-0 items-center gap-1">
                <span className="shrink-0">Reviewer</span>
                <ModelCombobox
                  models={models ?? []}
                  pinnedModelIds={pinnedModelIds ?? []}
                  selectedModel={evaluatorModel ?? ""}
                  onModelChange={onEvaluatorModelChange!}
                  open={evaluatorPickerOpen}
                  onOpenChange={setEvaluatorPickerOpen}
                  disabled={busy}
                  onOpenModelsSettings={onOpenModelsSettings}
                  onOpenProvidersSettings={onOpenProvidersSettings}
                  placeholder="Choose reviewer"
                />
              </div>
            ) : null}
          </div>
        ) : workerLlm || evaluatorLlm ? (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {workerLlm ? `Worker: ${workerLlm.label}` : null}
            {workerLlm && evaluatorLlm ? " · " : null}
            {evaluatorLlm ? `Reviewer: ${evaluatorLlm.label}` : null}
          </span>
        ) : null}

        {isPending ? (
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onRequestRevision?.(toolCallId)}
            >
              No, do it differently
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => onApprove?.(toolCallId)}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Approve
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
