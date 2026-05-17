import { OutputType, type NotebookOutputType } from "@/lib/types";

/** Synthetic MIME key used to route stream outputs through the registry. */
export const STREAM_MIME = "application/vnd.orion.stream";

/** Synthetic MIME key used to route error outputs through the registry. */
export const ERROR_MIME = "application/vnd.orion.error";

/** Synthetic MIME key used when no supported bundle entry is available. */
export const EMPTY_MIME = "application/vnd.orion.empty";

/**
 * Convert a notebook output into a MIME-like bundle map so all output types can
 * use the same MIME selection flow.
 */
export function getOutputMimeBundle(
  output: NotebookOutputType
): Record<string, unknown> {
  if (
    output.output_type === OutputType.EXECUTE_RESULT ||
    output.output_type === OutputType.DISPLAY_DATA
  ) {
    return (output.data ?? {}) as Record<string, unknown>;
  }

  if (output.output_type === OutputType.STREAM) {
    return {
      [STREAM_MIME]: {
        name: output.name ?? "stdout",
        text: Array.isArray(output.text) ? output.text.join("") : (output.text ?? ""),
      },
    };
  }

  if (output.output_type === OutputType.ERROR) {
    return {
      [ERROR_MIME]: {
        ename: output.ename ?? "",
        evalue: output.evalue ?? "",
        traceback: output.traceback ?? [],
      },
    };
  }

  return { [EMPTY_MIME]: null };
}
