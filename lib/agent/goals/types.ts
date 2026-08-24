import { z } from "zod";

export const GoalDeliverableSchema = z.object({
  path: z.string().trim().min(1).max(1_000).refine((path) => {
    const normalized = path.replaceAll("\\", "/");
    return (
      !normalized.startsWith("/") &&
      !/^[A-Za-z]:\//.test(normalized) &&
      !normalized.split("/").includes("..")
    );
  }, "Deliverable paths must stay within the goal workspace."),
  description: z.string().trim().min(1).max(2_000),
});

export const GoalAcceptanceCriterionSchema = z.object({
  id: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(2_000),
});

export const GoalContractSchema = z
  .object({
    objective: z.string().trim().min(1).max(8_000),
    deliverables: z.array(GoalDeliverableSchema).min(1).max(50),
    acceptanceCriteria: z.array(GoalAcceptanceCriterionSchema).min(1).max(50),
    constraints: z.array(z.string().trim().min(1).max(2_000)).max(50).default([]),
  })
  .superRefine((value, context) => {
    const deliverablePaths = new Set<string>();
    value.deliverables.forEach((deliverable, index) => {
      if (deliverablePaths.has(deliverable.path)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["deliverables", index, "path"],
          message: "Deliverable paths must be unique.",
        });
      }
      deliverablePaths.add(deliverable.path);
    });
    const criterionIds = new Set<string>();
    value.acceptanceCriteria.forEach((criterion, index) => {
      if (criterionIds.has(criterion.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["acceptanceCriteria", index, "id"],
          message: "Acceptance criterion ids must be unique.",
        });
      }
      criterionIds.add(criterion.id);
    });
  });

export const GoalArtifactEntrySchema = z.object({
  path: z.string().min(1),
  kind: z.enum(["file", "notebook"]),
  size: z.number().int().nonnegative().nullable(),
  lastModified: z.string().nullable(),
});

export const GoalArtifactManifestSchema = z.object({
  entries: z.array(GoalArtifactEntrySchema),
  createdPaths: z.array(z.string()),
  modifiedPaths: z.array(z.string()),
  deletedPaths: z.array(z.string()),
  deliverablePaths: z.array(z.string()),
  fingerprint: z.string().min(1),
  truncated: z.boolean().default(false),
  capturedAt: z.string().datetime(),
});

export const GoalCriterionVerdictSchema = z.object({
  criterionId: z.string().min(1),
  status: z.enum(["pass", "fail", "uncertain"]),
  evidence: z.array(
    z.object({
      path: z.string().min(1),
      location: z.string().max(500).optional(),
      observation: z.string().min(1).max(4_000),
    })
  ).max(50),
  explanation: z.string().min(1).max(4_000),
});

export const GoalVerdictSchema = z
  .object({
    status: z.enum(["pass", "revise", "blocked"]),
    criteria: z.array(GoalCriterionVerdictSchema).min(1).max(50),
    summary: z.string().min(1).max(8_000),
    repairInstruction: z.string().trim().max(8_000).optional(),
    blockingReason: z.string().trim().max(8_000).optional(),
    confidence: z.number().min(0).max(1),
  })
  .superRefine((value, context) => {
    if (value.status === "revise" && !value.repairInstruction) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["repairInstruction"],
        message: "A revise verdict requires a repair instruction.",
      });
    }
    if (value.status === "blocked" && !value.blockingReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blockingReason"],
        message: "A blocked verdict requires a blocking reason.",
      });
    }
  });

export const GoalSessionStatusSchema = z.enum([
  "active",
  "completed",
  "stopped",
  "blocked",
  "budget_exhausted",
  "stalled",
  "error",
  "paused",
]);

export const GoalSessionPhaseSchema = z.enum(["working", "evaluating", "paused"]);

export const GoalEvaluationSchema = z.object({
  id: z.string().min(1),
  contractVersion: z.number().int().positive(),
  reviewNumber: z.number().int().positive(),
  modelRequestId: z.string().min(1),
  manifest: GoalArtifactManifestSchema,
  verdict: GoalVerdictSchema.nullable(),
  // Size-capped copy of the reviewer's own transcript, kept so a finished review
  // stays inspectable. Stored opaquely like chat and sub-agent messages are.
  transcript: z.array(z.unknown()).optional(),
  error: z.string().optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const GoalSessionSchema = z.object({
  id: z.string().min(1),
  chatId: z.string().min(1),
  contract: GoalContractSchema,
  contractVersion: z.number().int().positive(),
  evaluatorModel: z.string().min(1),
  evaluatorProvider: z.string().min(1),
  evaluatorModelId: z.string().min(1),
  evaluatorModelSettings: z.record(z.string(), z.unknown()).optional(),
  status: GoalSessionStatusSchema,
  phase: GoalSessionPhaseSchema,
  maxReviews: z.number().int().min(1).max(50),
  reviewCount: z.number().int().nonnegative(),
  unchangedRevisionCount: z.number().int().nonnegative(),
  baselineEntries: z.array(GoalArtifactEntrySchema),
  latestManifest: GoalArtifactManifestSchema.nullable(),
  latestVerdict: GoalVerdictSchema.nullable(),
  evaluations: z.array(GoalEvaluationSchema),
  workerRequestId: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
});

export const GoalEvaluationRequestSchema = z.object({
  contract: GoalContractSchema,
  manifest: GoalArtifactManifestSchema,
});

export const GoalContinuationSchema = z.object({
  contract: GoalContractSchema,
  contractVersion: z.number().int().positive(),
  instruction: z.string().trim().max(8_000).optional(),
});

export const GoalContractProposalResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("revision_requested") }),
  z.object({
    status: z.literal("approved"),
    goalSessionId: z.string().min(1),
  }),
]);

export type GoalContract = z.infer<typeof GoalContractSchema>;
export type GoalDeliverable = z.infer<typeof GoalDeliverableSchema>;
export type GoalArtifactEntry = z.infer<typeof GoalArtifactEntrySchema>;
export type GoalArtifactManifest = z.infer<typeof GoalArtifactManifestSchema>;
export type GoalVerdict = z.infer<typeof GoalVerdictSchema>;
export type GoalEvaluation = z.infer<typeof GoalEvaluationSchema>;
export type GoalSession = z.infer<typeof GoalSessionSchema>;
export type GoalSessionStatus = z.infer<typeof GoalSessionStatusSchema>;
export type GoalEvaluationRequest = z.infer<typeof GoalEvaluationRequestSchema>;
export type GoalContinuation = z.infer<typeof GoalContinuationSchema>;
export type GoalContractProposalResult = z.infer<typeof GoalContractProposalResultSchema>;
