/**
 * Unit Tests for all agent tools (no Jupyter server required)
 *
 * Covers:
 *   - BaseTool utilities (normalizeCellSource, extractOutputText, formatTSV, etc.)
 *   - NotebookManager (pure logic, no I/O)
 *   - ReadNotebookTool / ReadCellTool (read-only mock)
 *   - InsertCellTool / DeleteCellTool / OverwriteCellSourceTool (stateful mock)
 *   - ReadCellOutputTool (mocked ContentsManager)
 *
 * Run with:
 *   npx tsx lib/agent/tools/__tests__/tools-unit.test.ts
 */

import type { KernelService } from "@/lib/kernel/kernel-service";
import { NotebookManager } from "../notebook-manager";
import { BaseTool } from "../base-tool";
import { ReadNotebookTool } from "../read-notebook";
import { ReadCellTool } from "../read-cell";
import { ReadFileTool } from "../read-file";
import { EditFileTool } from "../edit-file";
import { ExecuteCellTool } from "../execute-cell";
import { InsertCellTool } from "../insert-cell";
import { DeleteCellTool } from "../delete-cell";
import { OverwriteCellSourceTool } from "../overwrite-cell-source";
import { EditOrionMetadataTool } from "../edit-orion-metadata";
import { BashTool } from "../bash";
import { ReadCellOutputTool } from "../read-cell-output";
import { formatTerminalResult } from "../terminal-command-utils";
import { CellType, OutputType } from "@/lib/types";
import type { NotebookType, NotebookOutputType } from "@/lib/types";
import type { MultimodalToolResult } from "../types";
import { guardToolText } from "../../tool-output-guard";
import { TerminalPool } from "@/lib/shell/terminal-pool";
import type { OpenDocumentSnapshotProvider } from "../../open-document-snapshots";

// ============================================================================
// Test Harness
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMsg, duration: Date.now() - start });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${errorMsg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertIncludes(text: string, substring: string, label?: string): void {
  if (!text.includes(substring)) {
    throw new Error(
      `${label ?? "Text"} should include "${substring}" but got: "${text.substring(0, 300)}"`
    );
  }
}

function assertNotIncludes(text: string, substring: string, label?: string): void {
  if (text.includes(substring)) {
    throw new Error(`${label ?? "Text"} should NOT include "${substring}"`);
  }
}

// ============================================================================
// Mock Factories
// ============================================================================

/** Read-only mock KernelService backed by a static notebook map. */
function createReadOnlyKernelService(notebooks: Record<string, NotebookType>): KernelService {
  return {
    getContentsManager: () => ({
      get: async (path: string) => {
        const nb = notebooks[path];
        if (!nb) throw new Error(`Not found: ${path}`);
        return { content: nb, type: "notebook", name: path };
      },
      save: async () => {},
    }),
    getStatus: () => "idle" as const,
    setActivePath: () => true,
    interrupt: async () => {},
    execute: async () => ({ done: Promise.resolve() }),
    testConnection: async () => true,
    shutdown: async () => {},
  } as unknown as KernelService;
}

/**
 * Stateful mock KernelService where saves are visible on subsequent reads.
 * Returns both the service and the backing store for assertions.
 */
function createStatefulKernelService(
  initial: Record<string, NotebookType> = {}
): { ks: KernelService; store: Map<string, NotebookType> } {
  const store = new Map<string, NotebookType>(Object.entries(initial));
  const ks = {
    getContentsManager: () => ({
      get: async (path: string) => {
        const nb = store.get(path);
        if (!nb) throw new Error(`Not found: ${path}`);
        return { content: nb, type: "notebook", name: path };
      },
      save: async (path: string, model: { content: NotebookType }) => {
        store.set(path, model.content);
      },
    }),
    getStatus: () => "idle" as const,
    setActivePath: () => true,
    interrupt: async () => {},
    execute: async () => ({ done: Promise.resolve() }),
    testConnection: async () => true,
    shutdown: async () => {},
  } as unknown as KernelService;
  return { ks, store };
}

/** Stateful mock KernelService backed by text file contents. */
function createTextKernelService(
  initial: Record<string, string> = {}
): { ks: KernelService; store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initial));
  const ks = {
    getContentsManager: () => ({
      get: async (path: string) => {
        if (!store.has(path)) throw new Error(`Not found: ${path}`);
        return { content: store.get(path), type: "file", name: path };
      },
      save: async (path: string, model: { content: string }) => {
        store.set(path, model.content);
      },
    }),
    getStatus: () => "idle" as const,
    setActivePath: () => true,
    interrupt: async () => {},
    execute: async () => ({ done: Promise.resolve() }),
    testConnection: async () => true,
    shutdown: async () => {},
  } as unknown as KernelService;
  return { ks, store };
}

/** Create a snapshot provider from optional text and notebook snapshots. */
function createSnapshotProvider(options: {
  text?: Record<string, string>;
  notebooks?: Record<string, NotebookType>;
  dirty?: boolean;
}): OpenDocumentSnapshotProvider {
  return {
    getTextSnapshot: (path) => {
      const content = options.text?.[path];
      return content === undefined
        ? null
        : { content, dirty: options.dirty ?? true, source: "editor-buffer" };
    },
    getNotebookSnapshot: (path) => {
      const notebook = options.notebooks?.[path];
      return notebook === undefined
        ? null
        : { notebook, dirty: options.dirty ?? true, source: "editor-buffer" };
    },
    saveOpenDocumentIfDirty: async () => ({ status: "not-open" }),
  };
}

/** Minimal terminal-capable KernelService for TerminalPool / BashTool unit tests. */
function createTerminalKernelService(): {
  ks: KernelService;
  live: Set<string>;
  sent: Array<{ name: string; text: string }>;
} {
  let counter = 0;
  const live = new Set<string>();
  const sent: Array<{ name: string; text: string }> = [];
  const ks = {
    startTerminal: async () => {
      const name = String(++counter);
      live.add(name);
      return name;
    },
    getTerminalConnection: (name: string) => (live.has(name) ? ({} as never) : undefined),
    closeTerminal: async (name: string) => {
      live.delete(name);
    },
    sendToTerminal: (name: string, text: string) => {
      sent.push({ name, text });
    },
    readTerminalBuffer: () => "",
    listTerminals: () => Array.from(live),
    refreshTerminalsFromServer: async () => {},
    onTerminalsChanged: () => () => {},
  } as unknown as KernelService;
  return { ks, live, sent };
}

/** Build a minimal notebook with the given cells. */
function makeNotebook(cells: NotebookType["cells"]): NotebookType {
  return {
    cells,
    metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" } },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

/** Build a single code cell with optional outputs. */
function makeCodeCell(source: string | string[], outputs: NotebookOutputType[] = [], execCount: number | null = null): NotebookType["cells"][0] {
  return {
    cell_type: CellType.CODE,
    source: Array.isArray(source) ? source : [source],
    metadata: {},
    execution_count: execCount,
    outputs,
  };
}

/** Build a single markdown cell. */
function makeMarkdownCell(source: string): NotebookType["cells"][0] {
  return { cell_type: CellType.MARKDOWN, source: [source], metadata: {} };
}

// ============================================================================
// Concrete BaseTool stub for testing protected utilities
// ============================================================================

class TestTool extends BaseTool {
  async execute(): Promise<string> { return ""; }

  // Expose protected methods publicly for testing
  public testNormalize(source: string | string[]): string {
    return this.normalizeCellSource(source);
  }
  public testCreateCode(src: string) { return this.createCodeCell(src); }
  public testCreateMarkdown(src: string) { return this.createMarkdownCell(src); }
  public testExtractOutput(outputs: Parameters<BaseTool["extractOutputText"]>[0]) {
    return this.extractOutputText(outputs);
  }
  public testExtractOutputSummary(outputs: Parameters<BaseTool["extractOutputSummary"]>[0]) {
    return this.extractOutputSummary(outputs);
  }
  public testFormatTSV(headers: string[], rows: string[][]) {
    return this.formatTSV(headers, rows);
  }
  public testFormatSize(n: number) { return this.formatSize(n); }
  public testTruncate(text: string) { return this.truncateOutput(text); }
}

function makeTool(): TestTool {
  return new TestTool(createReadOnlyKernelService({}), null);
}

// ============================================================================
// BaseTool Utilities
// ============================================================================

async function main() {

console.log("\n--- BaseTool: normalizeCellSource ---");

await runTest("string source is returned as-is", async () => {
  const t = makeTool();
  assert(t.testNormalize("hello") === "hello", "should return string unchanged");
});

await runTest("array source is joined without separator", async () => {
  const t = makeTool();
  assert(t.testNormalize(["line1\n", "line2"]) === "line1\nline2", "should join array");
});

await runTest("empty array returns empty string", async () => {
  const t = makeTool();
  assert(t.testNormalize([]) === "", "should return empty string");
});

console.log("\n--- BaseTool: createCodeCell / createMarkdownCell ---");

await runTest("createCodeCell has correct shape", async () => {
  const t = makeTool();
  const cell = t.testCreateCode("x = 1");
  assert(cell.cell_type === CellType.CODE, "cell_type should be code");
  assert(Array.isArray(cell.source) && cell.source[0] === "x = 1", "source should match");
  assert(Array.isArray(cell.outputs) && cell.outputs.length === 0, "outputs should be empty");
  assert(cell.execution_count === null, "execution_count should be null");
});

await runTest("createMarkdownCell has correct shape", async () => {
  const t = makeTool();
  const cell = t.testCreateMarkdown("# Title");
  assert(cell.cell_type === CellType.MARKDOWN, "cell_type should be markdown");
  assert(Array.isArray(cell.source) && cell.source[0] === "# Title", "source should match");
  assert(!("outputs" in cell), "markdown cell should have no outputs");
});

console.log("\n--- BaseTool: formatTSV ---");

await runTest("formatTSV produces header and rows", async () => {
  const t = makeTool();
  const tsv = t.testFormatTSV(["A", "B"], [["1", "2"], ["3", "4"]]);
  const lines = tsv.split("\n");
  assert(lines[0] === "A\tB", "first line should be header");
  assert(lines[1] === "1\t2", "second line should be first row");
  assert(lines[2] === "3\t4", "third line should be second row");
});

await runTest("formatTSV with no rows returns header only", async () => {
  const t = makeTool();
  const tsv = t.testFormatTSV(["X", "Y"], []);
  assert(tsv === "X\tY", "should contain only the header");
});

console.log("\n--- BaseTool: formatSize ---");

await runTest("formats bytes", async () => {
  const t = makeTool();
  assert(t.testFormatSize(512) === "512B", "should format bytes");
});

await runTest("formats KB", async () => {
  const t = makeTool();
  assert(t.testFormatSize(15360) === "15.0KB", "should format KB");
});

await runTest("formats MB", async () => {
  const t = makeTool();
  assert(t.testFormatSize(2097152) === "2.0MB", "should format MB");
});

console.log("\n--- BaseTool: truncateOutput ---");

await runTest("short text is returned unchanged", async () => {
  const t = makeTool();
  const short = "hello world";
  assert(t.testTruncate(short) === short, "short text should pass through unchanged");
});

await runTest("moderately long text is truncated with marker", async () => {
  const t = makeTool();
  const long = "x".repeat(14000);
  const result = t.testTruncate(long);
  assert(result.length < long.length, "result should be shorter than input");
  assertIncludes(result, "truncated for context safety", "should include truncation marker");
});

await runTest("extremely long text returns compact fallback message", async () => {
  const t = makeTool();
  const long = "x".repeat(20000);
  const result = t.testTruncate(long);
  assert(result.length < long.length, "result should be shorter than input");
  assertIncludes(result, "Content is too large to read safely", "should return fallback message");
  assertNotIncludes(result, "xxxx", "should avoid returning a large preview");
});

await runTest("web extract style payload falls back when omitted tail exceeds one-third", async () => {
  const payload = `Extracted Content from: https://example.com\nContent: ${"r".repeat(120000)}`;
  const result = guardToolText(payload);
  assert(result.mode === "too_large", "payload should be treated as too large");
  assertIncludes(result.text, "Content is too large to read safely", "should return compact fallback");
});

console.log("\n--- BaseTool: extractOutputText ---");

await runTest("extracts stream text", async () => {
  const t = makeTool();
  const result = t.testExtractOutput([
    { output_type: OutputType.STREAM, name: "stdout", text: ["Hello\n", "World\n"] },
  ]);
  assert(result.some((r) => r.includes("Hello")), "should include stdout text");
});

await runTest("extracts execute_result text/plain", async () => {
  const t = makeTool();
  const result = t.testExtractOutput([
    { output_type: OutputType.EXECUTE_RESULT, execution_count: 1, data: { "text/plain": ["42"] }, metadata: {} },
  ]);
  assert(result.some((r) => r.includes("42")), "should include plain text");
});

await runTest("execute_result with image/png returns placeholder", async () => {
  const t = makeTool();
  const result = t.testExtractOutput([
    { output_type: OutputType.DISPLAY_DATA, data: { "image/png": "abc123" }, metadata: {} },
  ]);
  assert(result.some((r) => r.includes("[Image: PNG]")), "should return image placeholder");
});

await runTest("extracts error ename and evalue", async () => {
  const t = makeTool();
  const result = t.testExtractOutput([
    { output_type: OutputType.ERROR, ename: "TypeError", evalue: "bad type", traceback: [] },
  ]);
  assert(result.some((r) => r.includes("TypeError")), "should include ename");
  assert(result.some((r) => r.includes("bad type")), "should include evalue");
});

await runTest("unknown output type produces empty result", async () => {
  const t = makeTool();
  const result = t.testExtractOutput([{ output_type: "unknown_type" as any }]);
  assert(result.length === 0, "unknown output type should produce empty result");
});

console.log("\n--- BaseTool: extractOutputSummary ---");

await runTest("stream summary uses channel name", async () => {
  const t = makeTool();
  const result = t.testExtractOutputSummary([
    { output_type: OutputType.STREAM, name: "stderr", text: ["ignored\n"] },
  ]);
  assert(result.length === 1 && result[0] === "stream (stderr)", "should list stream channel only");
});

await runTest("execute_result summary lists sorted mime keys", async () => {
  const t = makeTool();
  const result = t.testExtractOutputSummary([
    {
      output_type: OutputType.EXECUTE_RESULT,
      execution_count: 1,
      data: { "text/plain": ["42"], "application/json": ["{}"] },
      metadata: {},
    },
  ]);
  assert(
    result[0] === "execute_result: application/json, text/plain",
    "should list mimes in sorted order"
  );
});

await runTest("error summary is output type only", async () => {
  const t = makeTool();
  const result = t.testExtractOutputSummary([
    { output_type: OutputType.ERROR, ename: "TypeError", evalue: "x", traceback: [] },
  ]);
  assert(result.length === 1 && result[0] === "error", "should not include traceback text");
});

// ============================================================================
// Terminal Tools / Pool
// ============================================================================

console.log("\n--- Terminal Tools / Pool ---");

await runTest("formatTerminalResult labels terminalName explicitly", async () => {
  const result = formatTerminalResult({
    status: "running",
    terminalName: "7",
    elapsedMs: 12,
    output: "",
  });
  assertIncludes(result, "terminalName: 7", "should use terminalName field name");
  assertNotIncludes(result, "terminal: 7", "should avoid the ambiguous terminal label");
});

await runTest("TerminalPool creates a fresh agent terminal for each request", async () => {
  const { ks } = createTerminalKernelService();
  const pool = new TerminalPool(ks);
  try {
    const first = await pool.createAgentTerminal("chat-1", "workspace");
    const second = await pool.createAgentTerminal("chat-1", "workspace");
    assert(first.name !== second.name, "each agent terminal creation should be fresh");
    assert(pool.getTerminalsForChat("chat-1").length === 2, "chat should track both created terminals");
  } finally {
    pool.dispose();
  }
});

await runTest("TerminalPool reuses idle system terminals", async () => {
  const { ks } = createTerminalKernelService();
  const pool = new TerminalPool(ks);
  try {
    const first = await pool.acquireSystemTerminal();
    assert(first.isWarm === false, "first system terminal should be newly created");
    pool.releaseSystemTerminal(first.terminal.name);

    const second = await pool.acquireSystemTerminal();
    assert(second.isWarm === true, "released system terminal should be picked up from the warm pool");
    assert(second.terminal.name === first.terminal.name, "system terminal reuse should stay pool-backed");
    pool.releaseSystemTerminal(second.terminal.name);
  } finally {
    pool.dispose();
  }
});

await runTest("BashTool creates a fresh terminal for empty terminalName", async () => {
  const { ks } = createTerminalKernelService();
  const pool = new TerminalPool(ks);
  const tool = new BashTool(ks, null, pool, () => "chat-1");
  try {
    const first = await tool.execute({
      command: "echo first",
      description: "Start a fresh shell",
      terminalName: "",
      cwd: "workspace",
      background: true,
    });
    const second = await tool.execute({
      command: "echo second",
      description: "Start another fresh shell",
      terminalName: "",
      cwd: "workspace",
      background: true,
    });

    const firstTerminal = first.match(/terminalName: (\S+)/)?.[1];
    const secondTerminal = second.match(/terminalName: (\S+)/)?.[1];
    assert(typeof firstTerminal === "string" && firstTerminal.length > 0, "first result should return a terminalName");
    assert(typeof secondTerminal === "string" && secondTerminal.length > 0, "second result should return a terminalName");
    assert(firstTerminal !== secondTerminal, "empty terminalName should create a fresh terminal each time");
  } finally {
    pool.dispose();
  }
});

await runTest("BashTool uses a PowerShell marker wrapper on Windows terminals", async () => {
  const { ks, sent } = createTerminalKernelService();
  const pool = new TerminalPool(ks);
  const tool = new BashTool(ks, null, pool, () => "chat-1", () => "powershell");
  try {
    await tool.execute({
      command: "git status",
      description: "Check repository status",
      terminalName: "",
      cwd: "workspace",
      background: true,
    });

    assert(sent.length === 1, "bash tool should dispatch one terminal payload");
    const wrappedCommand = sent[0]?.text ?? "";
    assertIncludes(wrappedCommand, "Write-Output 'ORION_CMD_START_", "should emit a PowerShell start marker");
    assertIncludes(wrappedCommand, 'Write-Output "ORION_CMD_END_', "should emit a PowerShell end marker");
    assertIncludes(wrappedCommand, "$global:LASTEXITCODE = $null", "should clear stale native exit codes");
    assertIncludes(wrappedCommand, "git status", "should include the requested command");
    assert(!/[\r\n]/.test(wrappedCommand.trimEnd()), "PowerShell wrapper should be a single terminal line");
    assertNotIncludes(wrappedCommand, "(set +e", "should not send POSIX grouping to PowerShell");
    assertNotIncludes(wrappedCommand, "__orion_rc=$?", "should not send POSIX exit capture to PowerShell");
  } finally {
    pool.dispose();
  }
});

await runTest("BashTool explains how to recover from an invented terminalName", async () => {
  const ks = {
    readTerminalBuffer: () => "",
    sendToTerminal: () => {
      throw new Error('Terminal "curl_term" not found');
    },
  } as unknown as KernelService;
  const tool = new BashTool(ks, null, null, null);
  const result = await tool.execute({
    command: "pwd",
    description: "Check the current directory",
    terminalName: "curl_term",
    cwd: "",
    background: false,
  });

  assertIncludes(result, 'terminalName: curl_term', "should echo the bad terminal name");
  assertIncludes(result, 'terminalName: ""', "should teach the empty-string recovery path");
  assertIncludes(result, "Do not invent terminal names", "should explain the failure mode");
});

// ============================================================================
// NotebookManager
// ============================================================================

console.log("\n--- NotebookManager ---");

await runTest("addNotebook returns a UUID and sets first notebook as current", async () => {
  const mgr = new NotebookManager();
  const id = mgr.addNotebook("nb1", "/nb1.ipynb", "k1");
  assert(typeof id === "string" && id.length > 0, "should return a non-empty ID");
  assert(mgr.getCurrentNotebookId() === id, "first notebook should be current");
  assert(mgr.getCurrentNotebookPath() === "/nb1.ipynb", "path should match");
  assert(mgr.getCurrentKernelId() === "k1", "kernelId should match");
});

await runTest("addNotebook stores display name in entry", async () => {
  const mgr = new NotebookManager();
  const id = mgr.addNotebook("my-label", "/nb1.ipynb", "k1");
  assert(mgr.get(id)?.name === "my-label", "entry should carry the display name");
});

await runTest("second addNotebook does not change current", async () => {
  const mgr = new NotebookManager();
  const id1 = mgr.addNotebook("nb1", "/nb1.ipynb", "k1");
  mgr.addNotebook("nb2", "/nb2.ipynb", "k2");
  assert(mgr.getCurrentNotebookId() === id1, "current should still be id1");
});

await runTest("addNotebook assigns unique IDs each time", async () => {
  const mgr = new NotebookManager();
  const id1 = mgr.addNotebook("active", "/nb.ipynb", "k1");
  const id2 = mgr.addNotebook("active", "/nb2.ipynb", "k2");
  assert(id1 !== id2, "same label should produce different IDs");
  assert(mgr.size === 2, "both notebooks should be tracked");
});

await runTest("setCurrentNotebook switches active notebook", async () => {
  const mgr = new NotebookManager();
  mgr.addNotebook("nb1", "/nb1.ipynb", "k1");
  const id2 = mgr.addNotebook("nb2", "/nb2.ipynb", "k2");
  mgr.setCurrentNotebook(id2);
  assert(mgr.getCurrentNotebookId() === id2, "should be id2");
});

await runTest("setCurrentNotebook throws for unknown ID", async () => {
  const mgr = new NotebookManager();
  let threw = false;
  try { mgr.setCurrentNotebook("00000000-0000-0000-0000-000000000000"); } catch { threw = true; }
  assert(threw, "should throw for unknown notebook ID");
});

await runTest("removeNotebook removes the notebook by ID", async () => {
  const mgr = new NotebookManager();
  const id = mgr.addNotebook("nb1", "/nb1.ipynb", "k1");
  assert(mgr.removeNotebook(id), "should return true");
  assert(!mgr.has(id), "notebook should be gone");
});

await runTest("removing current notebook switches to most-recent remaining", async () => {
  const mgr = new NotebookManager();
  const id1 = mgr.addNotebook("nb1", "/nb1.ipynb", "k1");
  const id2 = mgr.addNotebook("nb2", "/nb2.ipynb", "k2");
  mgr.setCurrentNotebook(id1);
  mgr.removeNotebook(id1);
  assert(mgr.getCurrentNotebookId() === id2, "should switch to id2");
});

await runTest("removing last notebook sets current to null", async () => {
  const mgr = new NotebookManager();
  const id = mgr.addNotebook("nb1", "/nb1.ipynb", "k1");
  mgr.removeNotebook(id);
  assert(mgr.getCurrentNotebookId() === null, "current should be null");
  assert(mgr.getCurrentNotebookPath() === null, "path should be null");
});

await runTest("removeNotebook returns false for unknown ID", async () => {
  const mgr = new NotebookManager();
  assert(!mgr.removeNotebook("00000000-0000-0000-0000-000000000000"), "should return false");
});

await runTest("listAll includes id, name, and isCurrent flag", async () => {
  const mgr = new NotebookManager();
  const idA = mgr.addNotebook("a", "/a.ipynb", "k1");
  const idB = mgr.addNotebook("b", "/b.ipynb", "k2");
  mgr.setCurrentNotebook(idB);
  const list = mgr.listAll();
  const b = list.find((n) => n.id === idB);
  const a = list.find((n) => n.id === idA);
  assert(b?.isCurrent === true, "b should be current");
  assert(a?.isCurrent === false, "a should not be current");
  assert(b?.name === "b", "name should be carried through");
});

await runTest("getByPath finds notebook by path", async () => {
  const mgr = new NotebookManager();
  const id = mgr.addNotebook("nb1", "/nb1.ipynb", "k1");
  const found = mgr.getByPath("/nb1.ipynb");
  assert(found !== null, "should find notebook");
  assert(found?.id === id, "should return correct ID");
});

await runTest("getByPath returns null for unknown path", async () => {
  const mgr = new NotebookManager();
  mgr.addNotebook("nb1", "/nb1.ipynb", "k1");
  assert(mgr.getByPath("/unknown.ipynb") === null, "should return null");
});

await runTest("reset clears all state", async () => {
  const mgr = new NotebookManager();
  mgr.addNotebook("nb1", "/nb1.ipynb", "k1");
  mgr.reset();
  assert(mgr.size === 0, "should have no notebooks");
  assert(mgr.getCurrentNotebookId() === null, "current should be null");
});

// ============================================================================
// File Tools
// ============================================================================

console.log("\n--- File Tools ---");

await runTest("read_file prefers active editor buffer over disk", async () => {
  const { ks } = createTextKernelService({ "script.py": "disk_value = 1\n" });
  const snapshots = createSnapshotProvider({
    text: { "script.py": "buffer_value = 2\n" },
  });
  const tool = new ReadFileTool(ks, null, snapshots);
  const result = await tool.execute({
    filePath: "script.py",
    startLine: 0,
    endLine: 0,
  });
  assertIncludes(result, "buffer_value = 2", "should read buffer content");
  assertIncludes(result, "source: editor buffer", "should identify buffer source");
  assertNotIncludes(result, "disk_value", "should not read stale disk content");
});

await runTest("read_file applies line ranges to editor buffer content", async () => {
  const { ks } = createTextKernelService({ "script.py": "disk\n" });
  const snapshots = createSnapshotProvider({
    text: { "script.py": "line0\nline1\nline2\n" },
  });
  const tool = new ReadFileTool(ks, null, snapshots);
  const result = await tool.execute({
    filePath: "script.py",
    startLine: 1,
    endLine: 1,
  });
  assertIncludes(result, "line1", "should include requested buffer line");
  assertNotIncludes(result, "line0", "should omit earlier buffer line");
  assertNotIncludes(result, "line2", "should omit later buffer line");
});

await runTest("read_file falls back to disk when no editor snapshot exists", async () => {
  const { ks } = createTextKernelService({ "script.py": "disk_value = 1\n" });
  const tool = new ReadFileTool(ks, null, createSnapshotProvider({}));
  const result = await tool.execute({
    filePath: "script.py",
    startLine: 0,
    endLine: 0,
  });
  assertIncludes(result, "disk_value = 1", "should read disk content");
  assertNotIncludes(result, "source: editor buffer", "should not mark disk reads");
});

await runTest("edit_file replace uses active editor buffer as base", async () => {
  const { ks, store } = createTextKernelService({ "script.py": "disk_value = 1\n" });
  const snapshots = createSnapshotProvider({
    text: { "script.py": "buffer_value = 2\n" },
  });
  const tool = new EditFileTool(ks, null, snapshots);
  const result = await tool.execute({
    filePath: "script.py",
    mode: "replace",
    content: "",
    oldString: "buffer_value = 2",
    newString: "buffer_value = 3",
  });
  assertIncludes(result, "Successfully edited", "should confirm edit");
  assert(store.get("script.py") === "buffer_value = 3\n", "should save patched buffer content");
});

// ============================================================================
// ReadNotebookTool
// ============================================================================

console.log("\n--- ReadNotebookTool ---");

const READ_NB_PATH = "read_nb.ipynb";
const readNbFixture = makeNotebook([
  makeMarkdownCell("# Introduction"),
  makeCodeCell("x = 1\ny = 2", [
    { output_type: OutputType.STREAM, name: "stdout", text: ["3\n"] },
  ], 1),
  makeCodeCell("x + y", [], 2),
]);
readNbFixture.metadata.orion = { subagent: { model: "gpt-5.2" } };
readNbFixture.cells[0]!.metadata = { orion: { id: "cell-intro", cellState: { isInputCollapsed: true } } };

function makeReadNotebookTool(): { tool: ReadNotebookTool; notebookId: string } {
  const ks = createReadOnlyKernelService({ [READ_NB_PATH]: readNbFixture });
  const mgr = new NotebookManager();
  const notebookId = mgr.addNotebook("main", READ_NB_PATH, "k1");
  return { tool: new ReadNotebookTool(ks, null, mgr), notebookId };
}

await runTest("brief format returns cell count and table", async () => {
  const { tool, notebookId } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId, responseFormat: "brief", startIndex: 0, limit: 50, includeOrionMetadata: false });
  assertIncludes(result, "3 cells", "should mention cell count");
  assertIncludes(result, "Index", "should have Index column");
  assertIncludes(result, "markdown", "should list markdown cell");
  assertIncludes(result, "code", "should list code cells");
});

await runTest("read_notebook prefers active editor buffer over disk", async () => {
  const diskFixture = makeNotebook([makeMarkdownCell("# Disk")]);
  const bufferFixture = makeNotebook([makeMarkdownCell("# Buffer")]);
  const ks = createReadOnlyKernelService({ "buffered.ipynb": diskFixture });
  const mgr = new NotebookManager();
  const notebookId = mgr.addNotebook("main", "buffered.ipynb", "k1");
  const tool = new ReadNotebookTool(
    ks,
    null,
    mgr,
    createSnapshotProvider({ notebooks: { "buffered.ipynb": bufferFixture } })
  );
  const result = await tool.execute({ notebookId, responseFormat: "detailed", startIndex: 0, limit: 10, includeOrionMetadata: false });
  assertIncludes(result, "# Buffer", "should read buffer notebook");
  assertIncludes(result, "source: editor buffer", "should identify buffer source");
  assertNotIncludes(result, "# Disk", "should not read stale disk notebook");
});

await runTest("brief format shows first line of source", async () => {
  const { tool, notebookId } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId, responseFormat: "brief", startIndex: 0, limit: 50, includeOrionMetadata: false });
  assertIncludes(result, "Introduction", "should include first line of markdown source");
});

await runTest("detailed format includes full source", async () => {
  const { tool, notebookId } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId, responseFormat: "detailed", startIndex: 0, limit: 50, includeOrionMetadata: false });
  assertIncludes(result, "x = 1", "should include full cell source");
  assertIncludes(result, "y = 2", "should include second line of source");
});

await runTest("detailed format lists output type and mimes", async () => {
  const { tool, notebookId } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId, responseFormat: "detailed", startIndex: 0, limit: 50, includeOrionMetadata: false });
  assertIncludes(result, "stream (stdout)", "should summarize stream output without body text");
});

await runTest("detailed format uses compact fallback when notebook payload is far too large", async () => {
  const hugeFixture = makeNotebook([
    makeCodeCell("y".repeat(30000), [], 1),
  ]);
  const ks = createReadOnlyKernelService({ "huge_read_nb.ipynb": hugeFixture });
  const mgr = new NotebookManager();
  const notebookId = mgr.addNotebook("huge", "huge_read_nb.ipynb", "k1");
  const tool = new ReadNotebookTool(ks, null, mgr);
  const result = await tool.execute({ notebookId, responseFormat: "detailed", startIndex: 0, limit: 10, includeOrionMetadata: false });
  assertIncludes(result, "Content is too large to read safely", "should trigger compact fallback");
});

await runTest("pagination: startIndex skips cells", async () => {
  const { tool, notebookId } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId, responseFormat: "brief", startIndex: 2, limit: 50, includeOrionMetadata: false });
  assertNotIncludes(result, "Introduction", "should not include cell 0");
  assertIncludes(result, "x + y", "should include cell 2");
});

await runTest("pagination: limit caps the result", async () => {
  const { tool, notebookId } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId, responseFormat: "brief", startIndex: 0, limit: 1, includeOrionMetadata: false });
  assertIncludes(result, "markdown", "should include first cell");
  assertNotIncludes(result, "x = 1", "should not include cells past limit");
});

await runTest("empty string notebookId uses current notebook", async () => {
  const { tool } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId: "", responseFormat: "brief", startIndex: 0, limit: 50, includeOrionMetadata: false });
  assertIncludes(result, "3 cells", "should use current notebook");
});

await runTest("unknown notebookId returns warning", async () => {
  const { tool } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId: "00000000-0000-0000-0000-000000000000", responseFormat: "brief", startIndex: 0, limit: 50, includeOrionMetadata: false });
  assertIncludes(result, "[WARNING]", "should warn about unknown notebook ID");
});

await runTest("out-of-range startIndex returns error", async () => {
  const { tool, notebookId } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId, responseFormat: "brief", startIndex: 99, limit: 50, includeOrionMetadata: false });
  assertIncludes(result, "[ERROR]", "should return error for out-of-range start");
});

await runTest("includeOrionMetadata=false omits notebook and cell Orion metadata", async () => {
  const { tool, notebookId } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId, responseFormat: "brief", startIndex: 0, limit: 50, includeOrionMetadata: false });
  assertNotIncludes(result, "Orion Metadata", "should omit metadata column/header");
  assertNotIncludes(result, "cell-intro", "should omit cell metadata values");
  assertNotIncludes(result, "gpt-5.2", "should omit notebook metadata values");
});

await runTest("includeOrionMetadata=true includes notebook and cell Orion metadata", async () => {
  const { tool, notebookId } = makeReadNotebookTool();
  const result = await tool.execute({ notebookId, responseFormat: "brief", startIndex: 0, limit: 50, includeOrionMetadata: true });
  assertIncludes(result, "Notebook Orion Metadata", "should include notebook metadata header");
  assertIncludes(result, "\"model\":\"gpt-5.2\"", "should include notebook metadata JSON");
  assertIncludes(result, "Orion Metadata", "should include cell metadata column");
  assertIncludes(result, "\"id\":\"cell-intro\"", "should include cell metadata JSON");
});

await runTest("read_notebook large Orion metadata uses compact fallback", async () => {
  const hugeFixture = makeNotebook([makeMarkdownCell("# Small")]);
  hugeFixture.metadata.orion = { huge: "m".repeat(30000) };
  const ks = createReadOnlyKernelService({ "huge_metadata.ipynb": hugeFixture });
  const mgr = new NotebookManager();
  const notebookId = mgr.addNotebook("huge", "huge_metadata.ipynb", "k1");
  const tool = new ReadNotebookTool(ks, null, mgr);
  const result = await tool.execute({ notebookId, responseFormat: "brief", startIndex: 0, limit: 10, includeOrionMetadata: true });
  assertIncludes(result, "Content is too large to read safely", "should trigger compact fallback");
});

// ============================================================================
// ReadCellTool
// ============================================================================

console.log("\n--- ReadCellTool ---");

const READ_CELL_PATH = "read_cell.ipynb";
const readCellFixture = makeNotebook([
  makeMarkdownCell("# Markdown Cell"),
  makeCodeCell("result = 42", [
    { output_type: OutputType.EXECUTE_RESULT, execution_count: 1, data: { "text/plain": ["42"] }, metadata: {} },
  ], 1),
  makeCodeCell("print('STDOUT_ONLY')", [
    { output_type: OutputType.STREAM, name: "stdout", text: ["STDOUT_ONLY\n"] },
  ], 2),
]);
readCellFixture.cells[1]!.metadata = { orion: { id: "cell-result", cellState: { isOutputHidden: false } } };

function makeReadCellTool() {
  const ks = createReadOnlyKernelService({ [READ_CELL_PATH]: readCellFixture });
  const mgr = new NotebookManager();
  mgr.addNotebook("main", READ_CELL_PATH, "k1");
  return new ReadCellTool(ks, null, mgr);
}

await runTest("reads cell type and source", async () => {
  const tool = makeReadCellTool();
  const result = await tool.execute({ cellIndices: [0], includeOutputs: false, includeOrionMetadata: false });
  assertIncludes(result, "markdown", "should include cell type");
  assertIncludes(result, "# Markdown Cell", "should include cell source");
});

await runTest("read_cell prefers active editor buffer over disk", async () => {
  const diskFixture = makeNotebook([makeCodeCell("disk_value = 1", [], null)]);
  const bufferFixture = makeNotebook([makeCodeCell("buffer_value = 2", [], null)]);
  const ks = createReadOnlyKernelService({ "buffered_cell.ipynb": diskFixture });
  const mgr = new NotebookManager();
  mgr.addNotebook("main", "buffered_cell.ipynb", "k1");
  const tool = new ReadCellTool(
    ks,
    null,
    mgr,
    createSnapshotProvider({ notebooks: { "buffered_cell.ipynb": bufferFixture } })
  );
  const result = await tool.execute({ cellIndices: [0], includeOutputs: false, includeOrionMetadata: false });
  assertIncludes(result, "buffer_value = 2", "should read buffer cell");
  assertIncludes(result, "source: editor buffer", "should identify buffer source");
  assertNotIncludes(result, "disk_value", "should not read stale disk cell");
});

await runTest("includeOutputs=true includes output text", async () => {
  const tool = makeReadCellTool();
  const result = await tool.execute({ cellIndices: [1], includeOutputs: true, includeOrionMetadata: false });
  assertIncludes(result, "42", "should include output value");
  assertIncludes(result, "Outputs", "should have outputs section");
});

await runTest("read_cell uses compact fallback when content is far too large", async () => {
  const hugeFixture = makeNotebook([
    makeCodeCell("z".repeat(30000), [], 1),
  ]);
  const ks = createReadOnlyKernelService({ "huge_read_cell.ipynb": hugeFixture });
  const mgr = new NotebookManager();
  mgr.addNotebook("main", "huge_read_cell.ipynb", "k1");
  const tool = new ReadCellTool(ks, null, mgr);
  const result = await tool.execute({ cellIndices: [0], includeOutputs: false, includeOrionMetadata: false });
  assertIncludes(result, "Content is too large to read safely", "should trigger compact fallback");
});

await runTest("includeOutputs=false omits outputs", async () => {
  const tool = makeReadCellTool();
  const result = await tool.execute({ cellIndices: [2], includeOutputs: false, includeOrionMetadata: false });
  // The source is print('STDOUT_ONLY') so the word appears in source.
  // We check that the outputs section itself is absent.
  assertNotIncludes(result, "Outputs", "should not have outputs section");
  assertNotIncludes(result, "--- Outputs ---", "should not have outputs separator");
});

await runTest("negative index resolves from end", async () => {
  const tool = makeReadCellTool();
  const result = await tool.execute({ cellIndices: [-1], includeOutputs: false, includeOrionMetadata: false });
  assertIncludes(result, "STDOUT_ONLY", "index -1 should be last cell");
});

await runTest("out-of-range index returns error", async () => {
  const tool = makeReadCellTool();
  const result = await tool.execute({ cellIndices: [99], includeOutputs: false, includeOrionMetadata: false });
  assertIncludes(result, "[ERROR]", "should return error");
  assertIncludes(result, "out of range", "should say out of range");
});

await runTest("no active notebook returns error", async () => {
  const ks = createReadOnlyKernelService({});
  const mgr = new NotebookManager();
  const tool = new ReadCellTool(ks, null, mgr);
  const result = await tool.execute({ cellIndices: [0], includeOutputs: false, includeOrionMetadata: false });
  assertIncludes(result, "[ERROR]", "should return error");
  assertIncludes(result, "use_notebook", "should mention use_notebook");
});

await runTest("empty cellIndices returns error", async () => {
  const tool = makeReadCellTool();
  const result = await tool.execute({ cellIndices: [], includeOutputs: false, includeOrionMetadata: false });
  assertIncludes(result, "[ERROR]", "should return error for empty array");
});

await runTest("reads multiple cells in one call", async () => {
  const tool = makeReadCellTool();
  const result = await tool.execute({ cellIndices: [0, 2], includeOutputs: false, includeOrionMetadata: false });
  assertIncludes(result, "# Markdown Cell", "should include first cell");
  assertIncludes(result, "STDOUT_ONLY", "should include last cell");
  assertIncludes(result, "==========", "should separate batch sections");
});

await runTest("read_cell includeOrionMetadata=false omits cell Orion metadata", async () => {
  const tool = makeReadCellTool();
  const result = await tool.execute({ cellIndices: [1], includeOutputs: false, includeOrionMetadata: false });
  assertNotIncludes(result, "Orion Metadata", "should omit metadata section");
  assertNotIncludes(result, "cell-result", "should omit metadata values");
});

await runTest("read_cell includeOrionMetadata=true includes cell Orion metadata", async () => {
  const tool = makeReadCellTool();
  const result = await tool.execute({ cellIndices: [1], includeOutputs: false, includeOrionMetadata: true });
  assertIncludes(result, "--- Orion Metadata ---", "should include metadata section");
  assertIncludes(result, "\"id\":\"cell-result\"", "should include metadata JSON");
});

await runTest("read_cell large Orion metadata uses compact fallback", async () => {
  const hugeCell = makeCodeCell("x = 1", [], 1);
  hugeCell.metadata = { orion: { huge: "m".repeat(30000) } };
  const hugeFixture = makeNotebook([hugeCell]);
  const ks = createReadOnlyKernelService({ "huge_cell_metadata.ipynb": hugeFixture });
  const mgr = new NotebookManager();
  mgr.addNotebook("main", "huge_cell_metadata.ipynb", "k1");
  const tool = new ReadCellTool(ks, null, mgr);
  const result = await tool.execute({ cellIndices: [0], includeOutputs: false, includeOrionMetadata: true });
  assertIncludes(result, "Content is too large to read safely", "should trigger compact fallback");
});

// ============================================================================
// ExecuteCellTool
// ============================================================================

console.log("\n--- ExecuteCellTool ---");

function makeExecuteCellTool(streamText: string): {
  tool: ExecuteCellTool;
  store: Map<string, NotebookType>;
} {
  const cell = makeCodeCell("print('hello')", [], null);
  cell.metadata = {
    tags: ["keep-me"],
    orion: {
      id: "cell-1",
      cellState: { isInputCollapsed: true },
    },
  };
  const notebook = makeNotebook([cell]);
  const { ks, store } = createStatefulKernelService({ "exec_cell.ipynb": notebook });
  const ksMutable = ks as unknown as {
    execute: (
      code: string,
      onMessage: (msg: {
        header?: { msg_type?: string };
        content?: Record<string, unknown>;
      }) => void
    ) => Promise<{ done: Promise<void> }>;
  };
  ksMutable.execute = async (_code, onMessage) => {
    onMessage({
      header: { msg_type: "execute_input" },
      content: { execution_count: 7 },
    });
    onMessage({
      header: { msg_type: "stream" },
      content: { name: "stdout", text: streamText },
    });
    onMessage({
      header: { msg_type: "execute_reply" },
      content: {},
    });
    return { done: Promise.resolve() };
  };

  const mgr = new NotebookManager();
  mgr.addNotebook("main", "exec_cell.ipynb", "k1");
  return { tool: new ExecuteCellTool(ks, null, mgr), store };
}

await runTest("execute_cell applies aggregate guardrail for oversized output", async () => {
  const { tool } = makeExecuteCellTool("w".repeat(20000));
  const result = await tool.execute({
    cellIndices: [0],
    timeoutSeconds: 10,
    stream: false,
    progressInterval: 1000,
  });
  const text = result.join("\n");
  assertIncludes(text, "Content is too large to read safely", "should trigger compact fallback");
});

await runTest("execute_cell writes Orion execution info metadata", async () => {
  const { tool, store } = makeExecuteCellTool("done\n");
  await tool.execute({
    cellIndices: [0],
    timeoutSeconds: 10,
    stream: false,
    progressInterval: 1000,
  });

  const savedCell = store.get("exec_cell.ipynb")!.cells[0]!;
  const executionInfo = savedCell.metadata?.orion?.cellState?.executionInfo;
  assert(savedCell.execution_count === 7, "should use kernel execution count");
  assert(savedCell.metadata?.tags?.[0] === "keep-me", "should preserve non-Orion metadata");
  assert(savedCell.metadata?.orion?.id === "cell-1", "should preserve Orion cell id");
  assert(
    savedCell.metadata?.orion?.cellState?.isInputCollapsed === true,
    "should preserve sibling cellState metadata"
  );
  assert(executionInfo?.status === "success", "should mark execution successful");
  assert(executionInfo?.startTime instanceof Date, "should store start time");
  assert(executionInfo?.endTime instanceof Date, "should store end time");
  assert(executionInfo?.lastExecuted instanceof Date, "should store last executed time");
  assert(typeof executionInfo?.duration === "number", "should store duration");
  assert(
    executionInfo?.statistics?.wallTime === executionInfo?.duration,
    "should store wall time statistic"
  );
});

// ============================================================================
// InsertCellTool
// ============================================================================

console.log("\n--- InsertCellTool ---");

function makeInsertTool(initial?: Record<string, NotebookType>) {
  const nb = makeNotebook([makeCodeCell("existing = True", [], null)]);
  const { ks, store } = createStatefulKernelService(initial ?? { "nb.ipynb": nb });
  const mgr = new NotebookManager();
  mgr.addNotebook("main", "nb.ipynb", "k1");
  return { tool: new InsertCellTool(ks, null, mgr), store };
}

await runTest("append at -1 adds cell to end", async () => {
  const { tool, store } = makeInsertTool();
  const result = await tool.execute({ cells: [{ cellType: "code", cellSource: "new_cell = 1" }], startIndex: -1 });
  assertIncludes(result, "inserted successfully", "should confirm insertion");
  assertIncludes(result, "Cell source changes:", "should include source delta section");
  assertIncludes(result, "Cell 1: +1 -0 lines", "should include inserted-cell line delta");
  assertIncludes(result, "Cell 1 diff:", "should include inserted-cell diff");
  const nb = store.get("nb.ipynb")!;
  assert(nb.cells.length === 2, "should have 2 cells");
  const lastCell = nb.cells[nb.cells.length - 1];
  assert(lastCell.source[0] === "new_cell = 1", "last cell should be the new one");
});

await runTest("insert at index 0 prepends cell", async () => {
  const { tool, store } = makeInsertTool();
  await tool.execute({ cells: [{ cellType: "code", cellSource: "prepended = True" }], startIndex: 0 });
  const nb = store.get("nb.ipynb")!;
  assert(nb.cells[0].source[0] === "prepended = True", "first cell should be the new one");
  assert(nb.cells[1].source[0] === "existing = True", "original should shift to index 1");
});

await runTest("inserts markdown cell correctly", async () => {
  const { tool, store } = makeInsertTool();
  await tool.execute({ cells: [{ cellType: "markdown", cellSource: "# Title" }], startIndex: -1 });
  const nb = store.get("nb.ipynb")!;
  const last = nb.cells[nb.cells.length - 1];
  assert(last.cell_type === CellType.MARKDOWN, "cell type should be markdown");
});

await runTest("inserts multiple cells at once in order", async () => {
  const { tool, store } = makeInsertTool();
  const result = await tool.execute({
    cells: [
      { cellType: "markdown", cellSource: "## Section" },
      { cellType: "code", cellSource: "a = 1" },
      { cellType: "code", cellSource: "b = 2" },
    ],
    startIndex: -1,
  });
  assertIncludes(result, "3 cells inserted successfully", "should confirm 3 cells");
  const nb = store.get("nb.ipynb")!;
  assert(nb.cells.length === 4, "should have 4 cells total");
  assert(nb.cells[1].source[0] === "## Section", "first inserted should be markdown");
  assert(nb.cells[2].source[0] === "a = 1", "second inserted should be a=1");
  assert(nb.cells[3].source[0] === "b = 2", "third inserted should be b=2");
});

await runTest("no active notebook returns error", async () => {
  const ks = createStatefulKernelService({}).ks;
  const mgr = new NotebookManager();
  const tool = new InsertCellTool(ks, null, mgr);
  const result = await tool.execute({ cells: [{ cellType: "code", cellSource: "x" }], startIndex: -1 });
  assertIncludes(result, "[ERROR]", "should return error when no notebook active");
});

// ============================================================================
// DeleteCellTool
// ============================================================================

console.log("\n--- DeleteCellTool ---");

function makeDeleteTool() {
  const nb = makeNotebook([
    makeMarkdownCell("# Header"),
    makeCodeCell("x = 1", [], 1),
    makeCodeCell("y = 2", [], 2),
    makeCodeCell("z = 3", [], 3),
  ]);
  const { ks, store } = createStatefulKernelService({ "nb.ipynb": nb });
  const mgr = new NotebookManager();
  mgr.addNotebook("main", "nb.ipynb", "k1");
  return { tool: new DeleteCellTool(ks, null, mgr), store };
}

await runTest("deletes a single cell", async () => {
  const { tool, store } = makeDeleteTool();
  const result = await tool.execute({ cellIndices: [1], includeSource: false });
  assertIncludes(result, "deleted successfully", "should confirm deletion");
  assertIncludes(result, "Cell source changes:", "should include source delta section");
  assertIncludes(result, "Cell 1: +0 -1 lines", "should include deleted-cell line delta");
  assertIncludes(result, "Cell 1 diff:", "should include deleted-cell diff");
  const nb = store.get("nb.ipynb")!;
  assert(nb.cells.length === 3, "should have 3 cells remaining");
  assert(nb.cells[1].source[0] === "y = 2", "cell 1 should now be former cell 2");
});

await runTest("deletes multiple cells in reverse index order", async () => {
  const { tool, store } = makeDeleteTool();
  await tool.execute({ cellIndices: [1, 3], includeSource: false });
  const nb = store.get("nb.ipynb")!;
  assert(nb.cells.length === 2, "should have 2 cells remaining");
  assert(nb.cells[0].source[0] === "# Header", "cell 0 should be markdown header");
  assert(nb.cells[1].source[0] === "y = 2", "cell 1 should be y=2 (was index 2)");
});

await runTest("includeSource=true shows deleted source", async () => {
  const { tool } = makeDeleteTool();
  const result = await tool.execute({ cellIndices: [1], includeSource: true });
  assertIncludes(result, "x = 1", "should include deleted cell source");
});

await runTest("out-of-range index returns error", async () => {
  const { tool } = makeDeleteTool();
  const result = await tool.execute({ cellIndices: [99], includeSource: false });
  assertIncludes(result, "[ERROR]", "should return error");
  assertIncludes(result, "out of range", "should say out of range");
});

await runTest("empty cellIndices returns error", async () => {
  const { tool } = makeDeleteTool();
  const result = await tool.execute({ cellIndices: [], includeSource: false });
  assertIncludes(result, "[ERROR]", "should return error for empty array");
});

// ============================================================================
// OverwriteCellSourceTool
// ============================================================================

console.log("\n--- OverwriteCellSourceTool ---");

function makeOverwriteTool() {
  const nb = makeNotebook([
    makeMarkdownCell("# Title"),
    makeCodeCell("x = 1\ny = 2\nprint(x + y)", [
      { output_type: OutputType.STREAM, name: "stdout", text: ["3\n"] },
    ], 1),
  ]);
  const { ks, store } = createStatefulKernelService({ "nb.ipynb": nb });
  const mgr = new NotebookManager();
  mgr.addNotebook("main", "nb.ipynb", "k1");
  return { tool: new OverwriteCellSourceTool(ks, null, mgr), store };
}

await runTest("overwrites cell source", async () => {
  const { tool, store } = makeOverwriteTool();
  const result = await tool.execute({ cells: [{ cellIndex: 1, newSource: "z = 99" }] });
  assertIncludes(result, "overwritten successfully", "should confirm overwrite");
  const nb = store.get("nb.ipynb")!;
  assert(nb.cells[1].source[0] === "z = 99", "source should be updated");
});

await runTest("overwrite_cell_source preserves unsaved editor-buffer cells", async () => {
  const diskNotebook = makeNotebook([
    makeCodeCell("disk cell 0", [], null),
    makeCodeCell("disk cell 1", [], null),
  ]);
  const bufferNotebook = makeNotebook([
    makeCodeCell("unsaved cell 0", [], null),
    makeCodeCell("unsaved cell 1", [], null),
  ]);
  const { ks, store } = createStatefulKernelService({ "buffered_overwrite.ipynb": diskNotebook });
  const mgr = new NotebookManager();
  mgr.addNotebook("main", "buffered_overwrite.ipynb", "k1");
  const tool = new OverwriteCellSourceTool(
    ks,
    null,
    mgr,
    createSnapshotProvider({ notebooks: { "buffered_overwrite.ipynb": bufferNotebook } })
  );
  await tool.execute({ cells: [{ cellIndex: 1, newSource: "agent cell 1" }] });
  const saved = store.get("buffered_overwrite.ipynb")!;
  assert(saved.cells[0].source[0] === "unsaved cell 0", "should preserve unsaved cell");
  assert(saved.cells[1].source[0] === "agent cell 1", "should apply agent edit");
});

await runTest("clears outputs and execution_count for code cells", async () => {
  const { tool, store } = makeOverwriteTool();
  await tool.execute({ cells: [{ cellIndex: 1, newSource: "z = 99" }] });
  const nb = store.get("nb.ipynb")!;
  const cell = nb.cells[1];
  assert(cell.outputs?.length === 0, "outputs should be cleared");
  assert(cell.execution_count === null, "execution_count should be null");
});

await runTest("generates diff showing changed lines", async () => {
  const { tool } = makeOverwriteTool();
  const result = await tool.execute({
    cells: [{ cellIndex: 1, newSource: "x = 1\ny = 20\nprint(x + y)" }],
  });
  assertIncludes(result, "diff", "result should mention diff");
  assertIncludes(result, "Cell 1: +1 -1 lines", "should include source line delta");
  assertIncludes(result, "-y = 2", "diff should show removed line");
  assertIncludes(result, "+y = 20", "diff should show added line");
});

await runTest("no-change overwrite reports no changes detected", async () => {
  const { tool } = makeOverwriteTool();
  const original = "x = 1\ny = 2\nprint(x + y)";
  const result = await tool.execute({ cells: [{ cellIndex: 1, newSource: original }] });
  assertIncludes(result, "no changes detected", "should report no changes");
});

await runTest("out-of-range index returns error", async () => {
  const { tool } = makeOverwriteTool();
  const result = await tool.execute({ cells: [{ cellIndex: 99, newSource: "x = 1" }] });
  assertIncludes(result, "[ERROR]", "should return error");
});

await runTest("overwrites multiple cells in one call", async () => {
  const { tool, store } = makeOverwriteTool();
  const result = await tool.execute({
    cells: [
      { cellIndex: 0, newSource: "## New title" },
      { cellIndex: 1, newSource: "only = True" },
    ],
  });
  assertIncludes(result, "Cell 0 overwritten", "should mention first cell");
  assertIncludes(result, "Cell 1 overwritten", "should mention second cell");
  const nb = store.get("nb.ipynb")!;
  assert(nb.cells[0].source[0] === "## New title", "markdown updated");
  assert(nb.cells[1].source[0] === "only = True", "code updated");
});

// ============================================================================
// EditOrionMetadataTool
// ============================================================================

console.log("\n--- EditOrionMetadataTool ---");

function makeEditOrionMetadataTool() {
  const nb = makeNotebook([
    {
      ...makeMarkdownCell("# Title"),
      metadata: {
        orion: {
          id: "cell-title",
          cellState: { isInputCollapsed: true, isOutputHidden: false },
        },
        tags: ["keep"],
      },
    },
    makeCodeCell("x = 1", [
      { output_type: OutputType.STREAM, name: "stdout", text: ["1\n"] },
    ], 1),
  ]);
  nb.metadata.orion = { appView: { enabled: true } };
  const { ks, store } = createStatefulKernelService({ "metadata.ipynb": nb });
  const mgr = new NotebookManager();
  const notebookId = mgr.addNotebook("main", "metadata.ipynb", "k1");
  return { tool: new EditOrionMetadataTool(ks, null, mgr), store, notebookId };
}

await runTest("merges notebook-level Orion metadata", async () => {
  const { tool, store, notebookId } = makeEditOrionMetadataTool();
  const result = await tool.execute({
    notebookId,
    edits: [
      {
        target: "notebook",
        cellIndex: -1,
        operation: "merge",
        path: ["subagent"],
        valueJson: "{\"model\":\"gpt-5.2\"}",
      },
    ],
  });
  assertIncludes(result, "Applied 1 Orion metadata edit", "should confirm edit");
  const orion = store.get("metadata.ipynb")!.metadata.orion as Record<string, any>;
  assert(orion.appView.enabled === true, "should preserve sibling notebook metadata");
  assert(orion.subagent.model === "gpt-5.2", "should merge subagent model");
});

await runTest("merges cell metadata while preserving id and sibling cellState fields", async () => {
  const { tool, store } = makeEditOrionMetadataTool();
  await tool.execute({
    notebookId: "",
    edits: [
      {
        target: "cell",
        cellIndex: 0,
        operation: "merge",
        path: ["cellState"],
        valueJson: "{\"isOutputHidden\":true}",
      },
    ],
  });
  const cell = store.get("metadata.ipynb")!.cells[0]!;
  const orion = cell.metadata!.orion as Record<string, any>;
  assert(orion.id === "cell-title", "should preserve protected cell id");
  assert(orion.cellState.isInputCollapsed === true, "should preserve sibling field");
  assert(orion.cellState.isOutputHidden === true, "should update merged field");
  assert((cell.metadata!.tags as string[])[0] === "keep", "should preserve non-Orion metadata");
});

await runTest("replaces scalar path and preserves outputs", async () => {
  const { tool, store } = makeEditOrionMetadataTool();
  await tool.execute({
    notebookId: "",
    edits: [
      {
        target: "cell",
        cellIndex: 1,
        operation: "replace",
        path: ["cellState", "isMuted"],
        valueJson: "true",
      },
    ],
  });
  const cell = store.get("metadata.ipynb")!.cells[1]!;
  const orion = cell.metadata!.orion as Record<string, any>;
  assert(orion.cellState.isMuted === true, "should replace scalar path");
  assert(cell.outputs?.length === 1, "should preserve outputs");
  assert(cell.execution_count === 1, "should preserve execution count");
});

await runTest("deletes nested path", async () => {
  const { tool, store } = makeEditOrionMetadataTool();
  await tool.execute({
    notebookId: "",
    edits: [
      {
        target: "cell",
        cellIndex: 0,
        operation: "delete",
        path: ["cellState", "isOutputHidden"],
        valueJson: "",
      },
    ],
  });
  const orion = store.get("metadata.ipynb")!.cells[0]!.metadata!.orion as Record<string, any>;
  assert(orion.cellState.isOutputHidden === undefined, "should delete nested field");
  assert(orion.cellState.isInputCollapsed === true, "should preserve sibling field");
});

await runTest("rejects invalid known cell metadata shape without saving", async () => {
  const { tool, store } = makeEditOrionMetadataTool();
  const result = await tool.execute({
    notebookId: "",
    edits: [
      {
        target: "cell",
        cellIndex: 0,
        operation: "replace",
        path: ["cellState", "isMuted"],
        valueJson: "\"yes\"",
      },
    ],
  });
  assertIncludes(result, "[ERROR]", "should return error");
  assertIncludes(result, "cellState.isMuted", "should explain invalid field");
  const orion = store.get("metadata.ipynb")!.cells[0]!.metadata!.orion as Record<string, any>;
  assert(orion.cellState.isMuted === undefined, "should not save invalid metadata");
});

await runTest("rejects invalid known notebook metadata shape without saving", async () => {
  const { tool, store } = makeEditOrionMetadataTool();
  const result = await tool.execute({
    notebookId: "",
    edits: [
      {
        target: "notebook",
        cellIndex: -1,
        operation: "replace",
        path: ["subagent", "model"],
        valueJson: "123",
      },
    ],
  });
  assertIncludes(result, "[ERROR]", "should return error");
  assertIncludes(result, "subagent.model", "should explain invalid field");
  const orion = store.get("metadata.ipynb")!.metadata.orion as Record<string, any>;
  assert(orion.subagent === undefined, "should not save invalid metadata");
});

await runTest("invalid JSON returns error and leaves notebook unchanged", async () => {
  const { tool, store } = makeEditOrionMetadataTool();
  const result = await tool.execute({
    notebookId: "",
    edits: [
      {
        target: "notebook",
        cellIndex: -1,
        operation: "merge",
        path: ["subagent"],
        valueJson: "{bad",
      },
    ],
  });
  assertIncludes(result, "[ERROR]", "should return error");
  const orion = store.get("metadata.ipynb")!.metadata.orion as Record<string, any>;
  assert(orion.subagent === undefined, "should not apply invalid edit");
});

await runTest("batch validation prevents partial metadata writes", async () => {
  const { tool, store } = makeEditOrionMetadataTool();
  const result = await tool.execute({
    notebookId: "",
    edits: [
      {
        target: "notebook",
        cellIndex: -1,
        operation: "merge",
        path: ["subagent"],
        valueJson: "{\"model\":\"gpt-5.2\"}",
      },
      {
        target: "notebook",
        cellIndex: -1,
        operation: "merge",
        path: ["bad"],
        valueJson: "{bad",
      },
    ],
  });
  assertIncludes(result, "[ERROR]", "should return error");
  const orion = store.get("metadata.ipynb")!.metadata.orion as Record<string, any>;
  assert(orion.subagent === undefined, "should not apply earlier valid edit in invalid batch");
});

await runTest("invalid cell index returns error", async () => {
  const { tool } = makeEditOrionMetadataTool();
  const result = await tool.execute({
    notebookId: "",
    edits: [
      {
        target: "cell",
        cellIndex: 99,
        operation: "merge",
        path: ["cellState"],
        valueJson: "{\"isMuted\":true}",
      },
    ],
  });
  assertIncludes(result, "[ERROR]", "should return error");
  assertIncludes(result, "out of range", "should explain invalid cell index");
});

await runTest("empty edits returns error", async () => {
  const { tool } = makeEditOrionMetadataTool();
  const result = await tool.execute({ notebookId: "", edits: [] });
  assertIncludes(result, "[ERROR]", "should return error");
});

await runTest("protected cell id mutation returns error", async () => {
  const { tool, store } = makeEditOrionMetadataTool();
  const result = await tool.execute({
    notebookId: "",
    edits: [
      {
        target: "cell",
        cellIndex: 0,
        operation: "replace",
        path: ["id"],
        valueJson: "\"new-id\"",
      },
    ],
  });
  assertIncludes(result, "[ERROR]", "should return error");
  const orion = store.get("metadata.ipynb")!.cells[0]!.metadata!.orion as Record<string, any>;
  assert(orion.id === "cell-title", "should preserve original id");
});

// ============================================================================
// ReadCellOutputTool
// ============================================================================

console.log("\n--- ReadCellOutputTool ---");

function setupReadCellOutput(outputs: NotebookOutputType[]): ReadCellOutputTool {
  const nb = makeNotebook([
    makeCodeCell("# test", outputs),
    makeMarkdownCell("# markdown"),
  ]);
  const ks = createReadOnlyKernelService({ "test.ipynb": nb });
  const mgr = new NotebookManager();
  const id = mgr.addNotebook("test", "test.ipynb", "k1");
  mgr.setCurrentNotebook(id);
  return new ReadCellOutputTool(ks, null, mgr);
}

await runTest("no active notebook returns error", async () => {
  const tool = new ReadCellOutputTool(createReadOnlyKernelService({}), null, new NotebookManager());
  const result = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
  assertIncludes(result as string, "[ERROR]", "should be an error");
  assertIncludes(result as string, "use_notebook", "should mention use_notebook");
});

await runTest("out-of-range cell index returns error", async () => {
  const tool = setupReadCellOutput([]);
  const result = await tool.execute({ reads: [{ cellIndex: 99, outputIndex: 0 }] });
  assertIncludes(result as string, "[ERROR]", "should be an error");
});

await runTest("read_cell_output prefers active editor buffer over disk", async () => {
  const diskNotebook = makeNotebook([
    makeCodeCell("# disk", [
      { output_type: OutputType.STREAM, name: "stdout", text: ["disk output\n"] },
    ]),
  ]);
  const bufferNotebook = makeNotebook([
    makeCodeCell("# buffer", [
      { output_type: OutputType.STREAM, name: "stdout", text: ["buffer output\n"] },
    ]),
  ]);
  const ks = createReadOnlyKernelService({ "buffered_output.ipynb": diskNotebook });
  const mgr = new NotebookManager();
  mgr.addNotebook("main", "buffered_output.ipynb", "k1");
  const tool = new ReadCellOutputTool(
    ks,
    null,
    mgr,
    createSnapshotProvider({ notebooks: { "buffered_output.ipynb": bufferNotebook } })
  );
  const result = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
  assertIncludes(result as string, "buffer output", "should read buffer output");
  assertIncludes(result as string, "source: editor buffer", "should identify buffer source");
  assertNotIncludes(result as string, "disk output", "should not read stale disk output");
});

await runTest("negative cell index resolves correctly", async () => {
  const tool = setupReadCellOutput([{ output_type: OutputType.STREAM, name: "stdout", text: ["hi\n"] }]);
  const result = await tool.execute({ reads: [{ cellIndex: -2, outputIndex: 0 }] });
  assertIncludes(result as string, "hi", "should return stream content");
});

await runTest("markdown cell returns error (no outputs)", async () => {
  const tool = setupReadCellOutput([]);
  const result = await tool.execute({ reads: [{ cellIndex: 1, outputIndex: 0 }] });
  assertIncludes(result as string, "[ERROR]", "should be an error");
  assertIncludes(result as string, "markdown", "should mention cell type");
});

await runTest("cell with no outputs returns informative message", async () => {
  const tool = setupReadCellOutput([]);
  const result = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
  assertIncludes(result as string, "no outputs", "should say no outputs");
  assertNotIncludes(result as string, "[ERROR]", "should not be an error");
});

await runTest("stream stdout returns labeled text", async () => {
  const tool = setupReadCellOutput([{ output_type: OutputType.STREAM, name: "stdout", text: ["Hello\n"] }]);
  const result = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
  assertIncludes(result as string, "Hello", "should include text");
  assertIncludes(result as string, "stdout", "should label stream");
});

await runTest("error output includes ename, evalue, traceback", async () => {
  const tool = setupReadCellOutput([
    { output_type: OutputType.ERROR, ename: "ValueError", evalue: "bad value", traceback: ["Traceback..."] },
  ]);
  const result = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
  assertIncludes(result as string, "ValueError", "should include ename");
  assertIncludes(result as string, "bad value", "should include evalue");
});

await runTest("plotly JSON is summarized", async () => {
  const plotlyFigure = {
    data: [{ type: "scatter", name: "S1", x: [1, 2], y: [3, 4] }],
    layout: { title: { text: "My Chart" }, xaxis: { title: { text: "X" } }, yaxis: { title: { text: "Y" } } },
  };
  const tool = setupReadCellOutput([
    { output_type: OutputType.DISPLAY_DATA, data: { "application/vnd.plotly.v1+json": plotlyFigure }, metadata: {} },
  ]);
  const result = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
  assertIncludes(result as string, "[Plotly Chart]", "should label as Plotly");
  assertIncludes(result as string, "My Chart", "should include title");
});

await runTest("PNG output returns MultimodalToolResult with image data", async () => {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ==";
  const tool = setupReadCellOutput([
    { output_type: OutputType.DISPLAY_DATA, data: { "image/png": b64, "text/plain": ["<figure>"] }, metadata: {} },
  ]);
  const result = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
  assert(typeof result === "object" && !Array.isArray(result) && result !== null, "should return object");
  const multi = result as MultimodalToolResult;
  assert("images" in multi, "should have images");
  assert(multi.images[0].mimeType === "image/png", "should be PNG");
  assert(multi.images[0].data === b64, "should preserve base64 data");
});

await runTest("oversized PNG output is downgraded to compact text guidance", async () => {
  const hugeB64 = "a".repeat(150000);
  const tool = setupReadCellOutput([
    { output_type: OutputType.DISPLAY_DATA, data: { "image/png": hugeB64 }, metadata: {} },
  ]);
  const result = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
  assert(typeof result === "string", "oversized image should return text guidance");
  assertIncludes(result as string, "omitted", "should explain image was omitted");
});

await runTest("text/markdown is preferred over text/plain", async () => {
  const tool = setupReadCellOutput([
    {
      output_type: OutputType.DISPLAY_DATA,
      data: {
        "text/markdown": "# Heading",
        "text/plain": ["<IPython.Markdown>"],
      },
      metadata: {},
    },
  ]);
  const result = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
  assertIncludes(result as string, "# Heading", "should use markdown");
  assertNotIncludes(result as string, "IPython.Markdown", "should not fall through to plain text");
});

await runTest("outputIndex selects the correct output among multiple", async () => {
  const tool = setupReadCellOutput([
    { output_type: OutputType.STREAM, name: "stdout", text: ["first\n"] },
    { output_type: OutputType.STREAM, name: "stdout", text: ["second\n"] },
  ]);
  const r0 = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
  const r1 = await tool.execute({ reads: [{ cellIndex: 0, outputIndex: 1 }] });
  assertIncludes(r0 as string, "first", "index 0 should be first");
  assertIncludes(r1 as string, "second", "index 1 should be second");
});

await runTest("batch reads multiple outputs in one call", async () => {
  const tool = setupReadCellOutput([
    { output_type: OutputType.STREAM, name: "stdout", text: ["first\n"] },
    { output_type: OutputType.STREAM, name: "stdout", text: ["second\n"] },
  ]);
  const batch = await tool.execute({
    reads: [
      { cellIndex: 0, outputIndex: 0 },
      { cellIndex: 0, outputIndex: 1 },
    ],
  });
  assertIncludes(batch as string, "first", "should include first output");
  assertIncludes(batch as string, "second", "should include second output");
  assertIncludes(batch as string, "==========", "should separate batch sections");
});

// ============================================================================
// Summary
// ============================================================================

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
const total = results.length;

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) {
  console.log("\nFailed tests:");
  for (const r of results.filter((r) => !r.passed)) {
    console.log(`  ✗ ${r.name}`);
    console.log(`    ${r.error}`);
  }
  process.exit(1);
}

console.log("\nAll unit tests passed!\n");

} // end main()

main().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
