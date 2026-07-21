"use client";

import * as React from "react";
import { DollarSign, RefreshCw, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ChatCostSummary } from "@/lib/chat/chat-storage";
import { cn } from "@/lib/utils";

/** Prefix for ephemeral assistant rows rendered by the `/cost` slash command. */
export const COST_SUMMARY_MESSAGE_ID_PREFIX = "cost-summary-";

/** Creates a unique message id for a `/cost` slash-command response row. */
export function createCostSummaryMessageId(): string {
  return `${COST_SUMMARY_MESSAGE_ID_PREFIX}${Date.now()}`;
}

export interface CostSummaryMessageData {
  summary: ChatCostSummary;
  modelLabels: Record<string, string>;
}

interface CostSummaryCardProps {
  summary: ChatCostSummary;
  modelLabels: Record<string, string>;
  className?: string;
  onDismiss?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

/** Human-readable provider names for cost summary rows. */
const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  xai: "xAI",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  mlx: "MLX",
  custom: "Custom Endpoint",
  vercel: "Vercel AI Gateway",
};

/** Resolves a provider id to a display label. */
function getProviderLabel(providerId: string): string {
  return PROVIDER_LABELS[providerId] ?? providerId;
}

/** Formats a request count as a plain number for table cells. */
function formatRequestCountNumber(count: number): string {
  return count.toLocaleString();
}

/** Formats a USD cost value compactly while keeping tiny session costs visible. */
function formatUsd(costUsd: number | null): string {
  if (costUsd == null) return "Unknown";
  const maximumFractionDigits = costUsd === 0 ? 2 : costUsd < 0.01 ? 6 : 4;
  return costUsd.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits,
  });
}

/** Renders the cost cell, including a note when some requests were unpriced. */
type CostProvenance = Pick<
  ChatCostSummary,
  | "bestAvailableTotalUsd"
  | "exactRequestCount"
  | "estimatedRequestCount"
  | "pendingRequestCount"
  | "unavailableRequestCount"
  | "legacyRequestCount"
>;

/** Renders best-available cost without implying mixed provenance is exact. */
function CostCell({ provenance }: { provenance: CostProvenance }) {
  const label = provenance.pendingRequestCount > 0
    ? "Pending"
    : provenance.exactRequestCount > 0 &&
        provenance.estimatedRequestCount === 0 &&
        provenance.legacyRequestCount === 0 &&
        provenance.unavailableRequestCount === 0
      ? "Exact"
      : provenance.estimatedRequestCount > 0 &&
          provenance.exactRequestCount === 0 &&
          provenance.legacyRequestCount === 0 &&
          provenance.unavailableRequestCount === 0
        ? "Estimated"
        : provenance.legacyRequestCount > 0 &&
            provenance.exactRequestCount === 0 &&
            provenance.estimatedRequestCount === 0 &&
            provenance.unavailableRequestCount === 0
          ? "Legacy estimate"
          : provenance.unavailableRequestCount > 0 &&
              provenance.bestAvailableTotalUsd == null
            ? "Unavailable"
            : "Mixed";

  return (
    <div className="space-y-0.5">
      <span className="font-mono tabular-nums">
        {formatUsd(provenance.bestAvailableTotalUsd)}
      </span>
      <span className="inline-block rounded border border-border/70 bg-muted/60 px-1 py-0.5 text-[9px] leading-none text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/** Renders session usage totals as a card with a per-model breakdown table. */
export function CostSummaryCard({
  summary,
  modelLabels,
  className,
  onDismiss,
  onRefresh,
  isRefreshing = false,
}: CostSummaryCardProps) {
  const hasRequests = summary.requestCount > 0;
  const showHeaderActions = onDismiss != null || onRefresh != null;

  return (
    <Card className={cn("w-full max-w-full overflow-hidden border-border/80 shadow-sm", className)}>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 border-b border-border/60 bg-muted/40 px-3 py-2">
        <DollarSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <CardTitle className="text-sm font-medium leading-none">Session cost</CardTitle>
        {showHeaderActions && (
          <div className="ml-auto flex items-center gap-0.5">
            {onRefresh && (
              <button
                type="button"
                className="corner-squircle rounded p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={onRefresh}
                disabled={isRefreshing}
                aria-label="Refresh session cost"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                className="corner-squircle rounded p-1 text-muted-foreground opacity-70 transition-opacity hover:opacity-100"
                onClick={onDismiss}
                aria-label="Dismiss session cost"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {!hasRequests ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            No model requests have been recorded for this chat yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 px-3 text-xs">Model</TableHead>
                <TableHead className="h-8 px-3 text-right text-xs"># Requests</TableHead>
                <TableHead className="h-8 px-3 text-right text-xs">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.models.map((model) => {
                const label = modelLabels[model.modelId] ?? model.modelId;

                return (
                  <TableRow
                    key={`${model.providerId}:${model.modelId}`}
                    className="hover:bg-muted/30"
                  >
                    <TableCell className="px-3 py-2 align-top text-xs">
                      <div className="min-w-0 space-y-0.5">
                        <span className="font-medium text-foreground">{label}</span>
                        <p className="text-[10px] text-muted-foreground">
                          {getProviderLabel(model.providerId)}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right align-top font-mono text-xs tabular-nums">
                      {formatRequestCountNumber(model.requestCount)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right align-top text-xs">
                      <CostCell
                        provenance={model}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="bg-muted/20 hover:bg-muted/20">
                <TableCell className="px-3 py-2 text-xs font-medium">Total</TableCell>
                <TableCell className="px-3 py-2 text-right align-top font-mono text-xs font-medium tabular-nums">
                  {formatRequestCountNumber(summary.requestCount)}
                </TableCell>
                <TableCell className="px-3 py-2 text-right align-top text-xs font-medium">
                  <CostCell
                    provenance={summary}
                  />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
