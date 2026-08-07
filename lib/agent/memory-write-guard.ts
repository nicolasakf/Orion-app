import type { OrionToolName } from "@/lib/agent/tool-schemas";

const ORION_MEMORY_ALTERNATE_WRITE_TOOLS: ReadonlySet<OrionToolName> = new Set([
  "edit_file",
  "bash",
  "execute_code",
  "insert_cell",
  "overwrite_cell_source",
]);

/** Detects attempts to route an ORION.md write through a non-memory tool. */
export function isProtectedMemoryWriteAttempt(
  toolName: OrionToolName,
  params: unknown,
): boolean {
  if (!ORION_MEMORY_ALTERNATE_WRITE_TOOLS.has(toolName)) return false;
  try {
    const serialized = JSON.stringify(params);
    return (
      /\bORION\.md\b/i.test(serialized) ||
      /\/api\/onboarding\/profile\b/i.test(serialized)
    );
  } catch {
    return false;
  }
}
