import { z } from "zod";

export const UpdateSourceSchema = z.enum(["npm", "pip", "uv", "desktop"]);
export type UpdateSource = z.infer<typeof UpdateSourceSchema>;

export const UpdateStatusSchema = z.enum([
  "unsupported",
  "idle",
  "checking",
  "current",
  "available",
  "downloading",
  "downloaded",
  "installing",
  "error",
]);
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>;

export const OrionUpdateStateSchema = z.object({
  supported: z.boolean(),
  source: UpdateSourceSchema.optional(),
  currentVersion: z.string(),
  latestVersion: z.string().optional(),
  status: UpdateStatusSchema,
  progress: z.number().min(0).max(100).optional(),
  error: z.string().optional(),
});
export type OrionUpdateState = z.infer<typeof OrionUpdateStateSchema>;

export const UpdateActionRequestSchema = z.object({
  action: z.literal("install"),
});

/** Compares stable dotted semantic versions without accepting partial versions. */
export function compareStableVersions(left: string, right: string): number {
  const parse = (value: string): number[] | null => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
    return match ? match.slice(1).map(Number) : null;
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  if (!leftParts || !rightParts) {
    throw new Error(`Invalid stable version comparison: ${left} / ${right}`);
  }
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
