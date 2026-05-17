/**
 * ListKernelsTool - List all running Jupyter kernels
 *
 * Uses @jupyterlab/services managers to fetch running sessions/kernels and
 * available kernel specs, then returns a formatted table with kernel ID, name,
 * state, and metadata.
 */

import { BaseTool } from "./base-tool";

export class ListKernelsTool extends BaseTool {
  /**
   * List all running kernels on the connected Jupyter server.
   *
   * @returns TSV-formatted table with kernel information
   */
  async execute(): Promise<string> {
    // Fetch running kernels and specs via @jupyterlab/services managers.
    const [kernels, availableKernels] = await Promise.all([
      this.kernelService.getRunningKernels(),
      this.kernelService.getAvailableKernels(),
    ]);
    const specsByName = new Map(
      availableKernels.map((kernelSpec) => [kernelSpec.name, kernelSpec])
    );

    if (kernels.length === 0) {
      return "[WARNING] No kernels found on the Jupyter server.";
    }

    // Build enriched kernel info
    const enrichedKernels = kernels.map((kernel) => {
      const spec = specsByName.get(kernel.name);
      return {
        id: kernel.id || "unknown",
        name: kernel.name || "unknown",
        displayName: spec?.displayName || kernel.name || "unknown",
        language: spec?.language || "unknown",
        state: kernel.execution_state || "unknown",
        connections: kernel.connections != null ? String(kernel.connections) : "unknown",
        lastActivity: this.formatLastActivity(kernel.last_activity),
      };
    });

    // Format as TSV table
    const headers = [
      "ID",
      "Name",
      "Display_Name",
      "Language",
      "State",
      "Connections",
      "Last_Activity",
    ];
    const rows = enrichedKernels.map((k) => [
      k.id,
      k.name,
      k.displayName,
      k.language,
      k.state,
      k.connections,
      k.lastActivity,
    ]);

    return this.formatTSV(headers, rows);
  }

  /**
   * Format a last_activity timestamp into a readable string.
   */
  private formatLastActivity(lastActivity?: string): string {
    if (!lastActivity) return "unknown";

    try {
      const dt = new Date(lastActivity);
      return dt.toISOString().replace("T", " ").substring(0, 19);
    } catch {
      return String(lastActivity);
    }
  }
}
