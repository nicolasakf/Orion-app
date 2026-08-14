import "server-only";

import { z } from "zod";

import type { ReasoningOption } from "@/lib/agent/model-catalog";

const CatalogReasoningEffortSchema = z.union([
  z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max", "default"]),
  z.null(),
]);

const ReasoningOptionsSchema = z.array(z.discriminatedUnion("type", [
  z.object({ type: z.literal("toggle") }),
  z.object({
    type: z.literal("effort"),
    values: z.array(CatalogReasoningEffortSchema),
  }),
  z.object({
    type: z.literal("budget_tokens"),
    min: z.number().nonnegative().optional(),
    max: z.number().nonnegative().optional(),
  }),
]));

/** Validates optional reasoning metadata without rejecting its base model row. */
export function parseReasoningOptions(value: unknown): ReasoningOption[] | undefined {
  if (value === undefined) return undefined;
  const parsed = ReasoningOptionsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
