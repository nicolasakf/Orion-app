import { z } from "zod";

export const EditCheckpointStatusSchema = z.enum([
  "open",
  "completed",
  "interrupted",
  "reverted",
]);

export const EditCheckpointTargetKindSchema = z.enum([
  "text_file",
  "notebook_cell",
]);

export const EditCheckpointOperationSchema = z.enum([
  "update",
  "insert",
  "delete",
]);

export type EditCheckpointStatus = z.infer<typeof EditCheckpointStatusSchema>;
export type EditCheckpointTargetKind = z.infer<typeof EditCheckpointTargetKindSchema>;
export type EditCheckpointOperation = z.infer<typeof EditCheckpointOperationSchema>;

export const TextFileCheckpointPayloadSchema = z.object({
  content: z.string(),
});

export const NotebookCellCheckpointPayloadSchema = z.object({
  index: z.number().int().min(0),
  source: z.string(),
  cell: z.unknown().optional(),
});

export const EditCheckpointTargetSchema = z.object({
  id: z.string(),
  checkpointId: z.string(),
  kind: EditCheckpointTargetKindSchema,
  operation: EditCheckpointOperationSchema,
  path: z.string(),
  targetId: z.string().nullable(),
  beforeJson: z.string(),
  afterJson: z.string(),
  beforeHash: z.string().nullable(),
  afterHash: z.string().nullable(),
  firstToolCallId: z.string().nullable(),
  lastToolCallId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const EditCheckpointSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  localChatId: z.string().nullable(),
  status: EditCheckpointStatusSchema,
  summary: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  targets: z.array(EditCheckpointTargetSchema).default([]),
});

export const RecordEditCheckpointTargetRequestSchema = z.object({
  requestId: z.string().min(1),
  localChatId: z.string().optional(),
  toolCallId: z.string().optional(),
  kind: EditCheckpointTargetKindSchema,
  operation: EditCheckpointOperationSchema,
  path: z.string().min(1),
  targetId: z.string().optional(),
  before: z.unknown(),
  after: z.unknown(),
  beforeHash: z.string().optional(),
  afterHash: z.string().optional(),
});

export const UpdateEditCheckpointStatusRequestSchema = z.object({
  status: EditCheckpointStatusSchema,
  summary: z.string().optional(),
});

export type EditCheckpointTarget = z.infer<typeof EditCheckpointTargetSchema>;
export type EditCheckpoint = z.infer<typeof EditCheckpointSchema>;
export type RecordEditCheckpointTargetRequest = z.infer<
  typeof RecordEditCheckpointTargetRequestSchema
>;
export type UpdateEditCheckpointStatusRequest = z.infer<
  typeof UpdateEditCheckpointStatusRequestSchema
>;

/** Builds a deterministic JSON string for checkpoint payload hashing/storage. */
export function stringifyCheckpointPayload(value: unknown): string {
  return JSON.stringify(value);
}

/** Small non-cryptographic hash for conflict checks and coalescing. */
export function hashCheckpointPayload(value: unknown): string {
  const input =
    typeof value === "string" ? value : stringifyCheckpointPayload(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
