/**
 * Builds the chat prompt used when a notebook cell error should be repaired.
 */
export function buildNotebookErrorRepairPrompt(cellReference: string): string {
  return `Fix the error in ${cellReference}, then run the whole notebook to make sure it completes successfully.`;
}
