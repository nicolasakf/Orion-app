// @vitest-environment node

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { KernelService } from "@/lib/kernel/kernel-service";
import { TerminalPool } from "@/lib/shell/terminal-pool";

import { AwaitCommandTool } from "./await-command";
import { BashTool, buildShellWrappedCommand } from "./bash";
import { KillCommandTool } from "./kill-command";

interface ProcessResult {
  code: number | null;
  stderr: string;
  stdout: string;
}

const temporaryDirectories: string[] = [];
const hasPosixShell = existsSync("/bin/bash");
const hasPowerShell = !spawnSync("pwsh", ["-NoLogo", "-NoProfile", "-Command", "$PSVersionTable.PSVersion"], {
  stdio: "ignore",
}).error;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

/** Run multiple wrapper lines through one shell process. */
function runPersistentShell(
  executable: string,
  args: string[],
  wrapperLines: string[]
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({
        code,
        stderr: stderr.replace(/\r\n/g, "\n"),
        stdout: stdout.replace(/\r\n/g, "\n"),
      })
    );
    child.stdin.end(`${wrapperLines.join("\n")}\n`);
  });
}

/** Build deterministic markers for wrapper integration tests. */
function wrapper(command: string, id: string, shell: "posix" | "powershell"): string {
  return buildShellWrappedCommand({
    command,
    shell,
    startMarker: `ORION_CMD_START_${id}`,
    endMarkerPrefix: `ORION_CMD_END_${id}`,
  });
}

describe.skipIf(!hasPosixShell)("POSIX persistent command wrapper", () => {
  it("preserves cwd, environment, and functions across commands", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orion-bash-state-"));
    temporaryDirectories.push(directory);
    const first = wrapper(
      `cd '${directory}'; export ORION_STATE_PROBE='kept'; orion_probe() { printf 'function=%s' "$ORION_STATE_PROBE"; }; printf 'tail-without-newline'`,
      "state_one",
      "posix"
    );
    const second = wrapper(
      `printf 'cwd=%s state=%s ' "$PWD" "$ORION_STATE_PROBE"; orion_probe`,
      "state_two",
      "posix"
    );

    const result = await runPersistentShell(
      "/bin/bash",
      ["--noprofile", "--norc"],
      [first, second]
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("tail-without-newline\nORION_CMD_END_state_one:0");
    expect(result.stdout).toContain(`cwd=${directory} state=kept function=kept`);
    expect(result.stdout).toContain("ORION_CMD_END_state_two:0");
  });

  it("isolates a fresh shell from prior state", async () => {
    const result = await runPersistentShell(
      "/bin/bash",
      ["--noprofile", "--norc"],
      [wrapper(`printf 'state=%s' "$ORION_STATE_PROBE"`, "fresh", "posix")]
    );

    expect(result.stdout).toContain("state=\nORION_CMD_END_fresh:0");
    expect(result.stdout).not.toContain("state=kept");
  });

  it("recovers from malformed quotes and executes the next command", async () => {
    const result = await runPersistentShell(
      "/bin/bash",
      ["--noprofile", "--norc"],
      [
        wrapper("printf '%s' 'unterminated", "malformed", "posix"),
        wrapper("printf 'recovered'", "recovered", "posix"),
      ]
    );

    expect(result.stdout).toMatch(/ORION_CMD_END_malformed:[1-9]\d*/);
    expect(result.stdout).toContain("recovered\nORION_CMD_END_recovered:0");
    expect(result.stderr).toContain("unexpected EOF");
  });

  it("supports multiline heredocs and Unicode", async () => {
    const command = [
      "value=$(cat <<'EOF'",
      "hello 🌍",
      "EOF",
      ")",
      `printf '%s' "$value"`,
    ].join("\n");
    const result = await runPersistentShell(
      "/bin/bash",
      ["--noprofile", "--norc"],
      [wrapper(command, "heredoc", "posix")]
    );

    expect(result.stdout).toContain("hello 🌍\nORION_CMD_END_heredoc:0");
  });
});

describe.skipIf(!hasPowerShell)("PowerShell persistent command wrapper", () => {
  it("preserves cwd, environment, and functions across commands", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orion-powershell-state-"));
    temporaryDirectories.push(directory);
    const escapedDirectory = directory.replaceAll("'", "''");
    const first = wrapper(
      `Set-Location '${escapedDirectory}'; $env:ORION_STATE_PROBE='kept'; function Invoke-OrionProbe { [Console]::Out.Write("function=$env:ORION_STATE_PROBE") }; [Console]::Out.Write('tail-without-newline')`,
      "ps_state_one",
      "powershell"
    );
    const second = wrapper(
      `[Console]::Out.Write("cwd=$(Get-Location) state=$env:ORION_STATE_PROBE "); Invoke-OrionProbe`,
      "ps_state_two",
      "powershell"
    );

    const result = await runPersistentShell(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"],
      [first, second]
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("tail-without-newline\nORION_CMD_END_ps_state_one:0");
    expect(result.stdout).toContain(`cwd=${directory} state=kept function=kept`);
    expect(result.stdout).toContain("ORION_CMD_END_ps_state_two:0");
  });

  it("recovers from malformed quotes and executes the next command", async () => {
    const result = await runPersistentShell(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"],
      [
        wrapper("Write-Output 'unterminated", "ps_malformed", "powershell"),
        wrapper("[Console]::Out.Write('recovered')", "ps_recovered", "powershell"),
      ]
    );

    expect(result.stdout).toContain("ORION_CMD_END_ps_malformed:1");
    expect(result.stdout).toContain("recovered\nORION_CMD_END_ps_recovered:0");
    expect(result.stderr).toContain("terminator");
  });
});

/** Create a buffered terminal mock for BashTool and AwaitCommandTool lifecycle tests. */
function createTerminalHarness(): {
  kernelService: KernelService;
  reads: string[];
  sent: string[];
} {
  const reads: string[] = [];
  const sent: string[] = [];
  const kernelService = {
    closeTerminal: async () => undefined,
    getTerminalConnection: () => ({}),
    listTerminals: () => ["1", "2"],
    onTerminalsChanged: () => () => undefined,
    readTerminalBuffer: () => reads.shift() ?? "",
    refreshTerminalsFromServer: async () => ["1", "2"],
    sendToTerminal: (_name: string, text: string) => {
      sent.push(text);
    },
    startTerminal: async () => "1",
  } as unknown as KernelService;
  return { kernelService, reads, sent };
}

describe("persistent terminal lifecycle", () => {
  it("does not drain, replace, or dispatch over a pending command", async () => {
    const { kernelService, reads, sent } = createTerminalHarness();
    reads.push("must remain unread");
    const pool = new TerminalPool(kernelService);
    const terminal = await pool.createAgentTerminal("chat-1");
    pool.setPendingCommand(terminal.name, {
      buffer: "existing output",
      endMarkerPrefix: "ORION_CMD_END_existing",
      startMarker: "ORION_CMD_START_existing",
      startedAtMs: 1,
      lastOutputAtMs: Date.now(),
    });
    const tool = new BashTool(kernelService, null, pool, () => "chat-1");

    try {
      const result = await tool.execute({
        background: true,
        command: "echo replacement",
        cwd: "",
        description: "Attempt to replace pending work",
        terminalName: terminal.name,
      });

      expect(result).toContain("status: error");
      expect(result).toContain("The new command was not dispatched");
      expect(result).toContain("await_command");
      expect(sent).toEqual([]);
      expect(reads).toEqual(["must remain unread"]);
      expect(pool.getPendingCommand(terminal.name)?.buffer).toBe("existing output");
    } finally {
      pool.dispose();
    }
  });

  it("keeps pending state when foreground Bash polling is cancelled", async () => {
    const { kernelService, sent } = createTerminalHarness();
    const pool = new TerminalPool(kernelService);
    const terminal = await pool.createAgentTerminal("chat-1");
    const tool = new BashTool(kernelService, null, pool, () => "chat-1");
    const controller = new AbortController();
    const cancelled = tool.execute(
      {
        background: false,
        command: "sleep 10",
        cwd: "",
        description: "Run a cancellable foreground command",
        terminalName: terminal.name,
      },
      controller.signal
    );
    setTimeout(() => controller.abort(), 10);

    try {
      await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
      expect(sent).toHaveLength(1);
      expect(pool.getPendingCommand(terminal.name)).not.toBeNull();
    } finally {
      pool.dispose();
    }
  });

  it("keeps pending state after cancellation and allows a later await to finish", async () => {
    const { kernelService, reads } = createTerminalHarness();
    const pool = new TerminalPool(kernelService);
    const terminal = await pool.createAgentTerminal("chat-1");
    pool.setPendingCommand(terminal.name, {
      buffer: "ORION_CMD_START_resume\npartial",
      endMarkerPrefix: "ORION_CMD_END_resume",
      startMarker: "ORION_CMD_START_resume",
      startedAtMs: 1,
      lastOutputAtMs: Date.now(),
    });
    const tool = new AwaitCommandTool(kernelService, null, pool);
    const controller = new AbortController();
    const cancelled = tool.execute(
      { pattern: "", terminalName: terminal.name },
      controller.signal
    );
    setTimeout(() => controller.abort(), 10);

    try {
      await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
      expect(pool.getPendingCommand(terminal.name)).not.toBeNull();

      reads.push(`\nORION_CMD_END_resume:0\nprompt`);
      const resumed = await tool.execute({ pattern: "", terminalName: terminal.name });
      expect(resumed).toContain("status: completed");
      expect(resumed).toContain("exit_code: 0");
      expect(resumed).toContain("partial");
      expect(pool.getPendingCommand(terminal.name)).toBeNull();
    } finally {
      pool.dispose();
    }
  });

  it("reports completion before an optional pattern match", async () => {
    const { kernelService } = createTerminalHarness();
    const pool = new TerminalPool(kernelService);
    const terminal = await pool.createAgentTerminal("chat-1");
    pool.setPendingCommand(terminal.name, {
      buffer: "ORION_CMD_START_ready\nREADY\nORION_CMD_END_ready:0\n",
      endMarkerPrefix: "ORION_CMD_END_ready",
      startMarker: "ORION_CMD_START_ready",
      startedAtMs: 1,
      lastOutputAtMs: Date.now(),
    });
    const tool = new AwaitCommandTool(kernelService, null, pool);

    try {
      const result = await tool.execute({ pattern: "READY", terminalName: terminal.name });
      expect(result).toContain("status: completed");
      expect(result).not.toContain("status: matched");
    } finally {
      pool.dispose();
    }
  });
});

/**
 * Terminal mock that answers kill_command's shell-responsiveness probe, so a
 * test can simulate a shell that recovers (or one that stays wedged).
 */
function createProbeHarness(options: { respondToProbe: boolean }): {
  kernelService: KernelService;
  reads: string[];
  sent: string[];
  closed: string[];
} {
  const reads: string[] = [];
  const sent: string[] = [];
  const closed: string[] = [];
  const kernelService = {
    closeTerminal: async (name: string) => {
      closed.push(name);
    },
    getTerminalConnection: () => ({}),
    listTerminals: () => ["1"],
    onTerminalsChanged: () => () => undefined,
    readTerminalBuffer: () => reads.shift() ?? "",
    refreshTerminalsFromServer: async () => ["1"],
    sendToTerminal: (_name: string, text: string) => {
      sent.push(text);
      const probe = /'(ORION_KILL_OK_)' '([a-z0-9]+)'/.exec(text);
      if (probe && options.respondToProbe) {
        reads.push(`\n${probe[1]}${probe[2]}\n$ `);
      }
    },
    startTerminal: async () => "1",
  } as unknown as KernelService;
  return { kernelService, reads, sent, closed };
}

/** Poll a predicate until it holds, so tests can observe async tool state. */
async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("waitFor timed out");
}

describe("non-interactive command environment", () => {
  it.skipIf(!hasPosixShell)("disables pagers for POSIX commands", async () => {
    const result = await runPersistentShell("/bin/bash", ["-s"], [
      wrapper('printf "%s|%s|%s\\n" "$PAGER" "$GH_PAGER" "$LESS"', "env", "posix"),
    ]);

    expect(result.stdout).toContain("cat|cat|FRX");
    expect(result.stdout).toContain("ORION_CMD_END_env:0");
  });

  it.skipIf(!hasPowerShell)("disables pagers for PowerShell commands", async () => {
    const result = await runPersistentShell(
      "pwsh",
      ["-NoLogo", "-NoProfile", "-Command", "-"],
      [wrapper("Write-Output \"$env:PAGER|$env:GIT_PAGER\"", "psenv", "powershell")]
    );

    expect(result.stdout).toContain("cat|cat");
    expect(result.stdout).toContain("ORION_CMD_END_psenv:0");
  });
});

describe("stalled terminal detection", () => {
  it("reports a pager prompt as stalled instead of running", async () => {
    const { kernelService, reads } = createTerminalHarness();
    const pool = new TerminalPool(kernelService);
    const terminal = await pool.createAgentTerminal("chat-1");
    const tool = new BashTool(kernelService, null, pool, () => "chat-1");

    try {
      const dispatched = tool.execute({
        background: false,
        command: "gh api user",
        cwd: "",
        description: "Fetch the authenticated GitHub user",
        terminalName: terminal.name,
      });
      await waitFor(() => pool.getPendingCommand(terminal.name) !== null);
      const pending = pool.getPendingCommand(terminal.name)!;
      reads.push(`\n${pending.startMarker}\n{"login": "octocat"}\n(END)`);

      const result = await dispatched;
      expect(result).toContain("status: stalled");
      expect(result).toContain("interactive pager end-of-file prompt");
      expect(result).toContain("kill_command");
      expect(result).toContain('{"login": "octocat"}');
    } finally {
      pool.dispose();
    }
  }, 15_000);
});

describe("kill_command recovery", () => {
  it("frees a wedged terminal and clears its pending command", async () => {
    const { kernelService, sent } = createProbeHarness({ respondToProbe: true });
    const pool = new TerminalPool(kernelService);
    const terminal = await pool.createAgentTerminal("chat-1");
    pool.setPendingCommand(terminal.name, {
      buffer: "ORION_CMD_START_stuck\nhosts file\n(END)",
      endMarkerPrefix: "ORION_CMD_END_stuck",
      startMarker: "ORION_CMD_START_stuck",
      startedAtMs: 1,
      lastOutputAtMs: 1,
    });
    const tool = new KillCommandTool(kernelService, null, pool);

    try {
      const result = await tool.execute({
        mode: "interrupt",
        terminalName: terminal.name,
      });

      expect(result).toContain("status: killed");
      expect(result).toContain("hosts file");
      expect(sent[0]).toBe("\u0003");
      expect(pool.getPendingCommand(terminal.name)).toBeNull();
    } finally {
      pool.dispose();
    }
  }, 15_000);

  it("escalates to a pager quit and then asks for the terminal to be closed", async () => {
    const { kernelService, sent } = createProbeHarness({ respondToProbe: false });
    const pool = new TerminalPool(kernelService);
    const terminal = await pool.createAgentTerminal("chat-1");
    pool.setPendingCommand(terminal.name, {
      buffer: "ORION_CMD_START_stuck\n",
      endMarkerPrefix: "ORION_CMD_END_stuck",
      startMarker: "ORION_CMD_START_stuck",
      startedAtMs: 1,
      lastOutputAtMs: 1,
    });
    const tool = new KillCommandTool(kernelService, null, pool);

    try {
      const result = await tool.execute({
        mode: "interrupt",
        terminalName: terminal.name,
      });

      expect(result).toContain("status: stalled");
      expect(result).toContain('mode: "close"');
      expect(sent).toContain("q");
      expect(sent).toContain("\u0015");
      expect(sent).toContain("\u0004");
      expect(pool.getPendingCommand(terminal.name)).not.toBeNull();
    } finally {
      pool.dispose();
    }
  }, 15_000);

  it("reports a terminal that disappeared mid-interrupt as killed", async () => {
    const { kernelService } = createProbeHarness({ respondToProbe: false });
    const failing = {
      ...kernelService,
      readTerminalBuffer: () => {
        throw new Error('Terminal "1" not found');
      },
    } as unknown as KernelService;
    const pool = new TerminalPool(kernelService);
    const terminal = await pool.createAgentTerminal("chat-1");
    pool.setPendingCommand(terminal.name, {
      buffer: "",
      endMarkerPrefix: "ORION_CMD_END_gone",
      startMarker: "ORION_CMD_START_gone",
      startedAtMs: 1,
      lastOutputAtMs: 1,
    });
    const tool = new KillCommandTool(failing, null, pool);

    try {
      const result = await tool.execute({
        mode: "interrupt",
        terminalName: terminal.name,
      });

      expect(result).toContain("status: killed");
      expect(result).toContain('terminalName ""');
      expect(pool.getPendingCommand(terminal.name)).toBeNull();
    } finally {
      pool.dispose();
    }
  });

  it("closes the terminal and drops it from the pool", async () => {
    const { kernelService, closed } = createProbeHarness({ respondToProbe: false });
    const pool = new TerminalPool(kernelService);
    const terminal = await pool.createAgentTerminal("chat-1");
    pool.setPendingCommand(terminal.name, {
      buffer: "",
      endMarkerPrefix: "ORION_CMD_END_stuck",
      startMarker: "ORION_CMD_START_stuck",
      startedAtMs: 1,
      lastOutputAtMs: 1,
    });
    const tool = new KillCommandTool(kernelService, null, pool);

    try {
      const result = await tool.execute({
        mode: "close",
        terminalName: terminal.name,
      });

      expect(result).toContain("status: killed");
      expect(closed).toEqual([terminal.name]);
      expect(pool.getTerminal(terminal.name)).toBeUndefined();
    } finally {
      pool.dispose();
    }
  });

  it("reports a command that completed before it could be stopped", async () => {
    const { kernelService } = createProbeHarness({ respondToProbe: true });
    const pool = new TerminalPool(kernelService);
    const terminal = await pool.createAgentTerminal("chat-1");
    pool.setPendingCommand(terminal.name, {
      buffer: "ORION_CMD_START_done\nfinished\nORION_CMD_END_done:0\n",
      endMarkerPrefix: "ORION_CMD_END_done",
      startMarker: "ORION_CMD_START_done",
      startedAtMs: 1,
      lastOutputAtMs: 1,
    });
    const tool = new KillCommandTool(kernelService, null, pool);

    try {
      const result = await tool.execute({
        mode: "interrupt",
        terminalName: terminal.name,
      });

      expect(result).toContain("status: completed");
      expect(result).toContain("exit_code: 0");
      expect(pool.getPendingCommand(terminal.name)).toBeNull();
    } finally {
      pool.dispose();
    }
  }, 15_000);
});
