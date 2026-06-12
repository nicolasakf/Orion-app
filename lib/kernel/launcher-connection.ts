import { z } from "zod";

export const JupyterCapabilitiesSchema = z.object({
  kernelspecs: z.boolean(),
  sessions: z.boolean(),
  kernels: z.boolean(),
  contents: z.boolean(),
  terminals: z.boolean(),
  sysInfo: z.boolean().optional(),
});

export const LauncherJupyterConnectionSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().optional(),
  source: z.enum(["managed", "existing"]),
  pythonPath: z.string().min(1),
  rootDirectory: z.string().min(1).optional(),
  jupyterVersion: z.string().min(1),
  capabilities: JupyterCapabilitiesSchema,
  createdAt: z.string().datetime(),
});

export const LauncherJupyterConnectionResponseSchema = z.object({
  connection: LauncherJupyterConnectionSchema,
});

export type JupyterCapabilities = z.infer<typeof JupyterCapabilitiesSchema>;
export type LauncherJupyterConnection = z.infer<
  typeof LauncherJupyterConnectionSchema
>;

/**
 * Loads the CLI-managed Jupyter connection exposed by the local Orion server.
 *
 * Returns null when Orion was not started through the CLI or when no connection
 * handoff has been written yet.
 */
export async function fetchLauncherJupyterConnection(): Promise<LauncherJupyterConnection | null> {
  const response = await fetch("/api/local/jupyter/connection", {
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Failed to load CLI-managed Jupyter connection.");
  }

  const body: unknown = await response.json();
  const parsed = LauncherJupyterConnectionResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("CLI-managed Jupyter connection response is invalid.");
  }

  return parsed.data.connection;
}
