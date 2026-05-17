import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";

/** Fixed token for the embedded test server (must match KernelService `appendToken` usage). */
export const EMBEDDED_JUPYTER_TOKEN = "orion-integration-test";

/**
 * Returns a free TCP port on 127.0.0.1 for binding Jupyter Server.
 */
export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (typeof addr === "object" && addr !== null && "port" in addr) {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        server.close();
        reject(new Error("Could not resolve ephemeral port"));
      }
    });
    server.on("error", reject);
  });
}

export interface EmbeddedJupyterServer {
  /** Base URL with trailing slash (matches KernelService normalization). */
  baseUrl: string;
  token: string;
  /** Terminate the Jupyter subprocess. */
  dispose: () => void;
}

export interface StartEmbeddedJupyterOptions {
  /** Notebook / ContentsManager root directory. */
  cwd: string;
  /** Max time to wait until GET /api responds with the token. */
  readyTimeoutMs?: number;
}

/**
 * Starts a local `jupyter server` with a known token, CORS, and XSRF checks
 * disabled so Node `@jupyterlab/services` clients can POST without browser cookies.
 */
export async function startEmbeddedJupyterServer(
  options: StartEmbeddedJupyterOptions
): Promise<EmbeddedJupyterServer> {
  const { cwd, readyTimeoutMs = 90_000 } = options;
  const port = await findFreePort();
  const token = EMBEDDED_JUPYTER_TOKEN;

  const args = [
    "server",
    "--no-browser",
    "--ip=127.0.0.1",
    `--port=${port}`,
    `--ServerApp.token=${token}`,
    "--ServerApp.allow_origin=*",
    "--ServerApp.disable_check_xsrf=True",
  ];

  let proc: ChildProcess;
  try {
    proc = spawn("jupyter", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
  } catch {
    throw new Error(
      "Failed to spawn `jupyter`. Install Jupyter (for example conda install jupyter) and ensure `jupyter` is on PATH."
    );
  }

  const stderrChunks: Buffer[] = [];
  proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  const baseNoSlash = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + readyTimeoutMs;

  while (Date.now() < deadline) {
    if (proc.exitCode !== null && proc.exitCode !== 0) {
      const errText = Buffer.concat(stderrChunks).toString("utf8").slice(-4000);
      throw new Error(
        `Jupyter exited before ready (code ${proc.exitCode}). stderr:\n${errText}`
      );
    }
    try {
      const res = await fetch(
        `${baseNoSlash}/api?token=${encodeURIComponent(token)}`
      );
      if (res.ok) {
        const dispose = () => {
          if (proc.killed) return;
          proc.kill("SIGTERM");
          setTimeout(() => {
            try {
              proc.kill("SIGKILL");
            } catch {
              /* ignore */
            }
          }, 5000).unref();
        };

        return {
          baseUrl: `${baseNoSlash}/`,
          token,
          dispose,
        };
      }
    } catch {
      // Server not listening yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  try {
    proc.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  const errText = Buffer.concat(stderrChunks).toString("utf8").slice(-4000);
  throw new Error(
    `Jupyter did not become ready within ${readyTimeoutMs}ms. stderr:\n${errText}`
  );
}
