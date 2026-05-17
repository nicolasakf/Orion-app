/**
 * Integration Tests for Jupyter Notebook Tools
 *
 * These tests require a running Jupyter server to execute.
 * They verify that all tools work with real Jupyter kernels
 * and actual notebook files -- NO MOCKS.
 *
 * By default this file starts its own Jupyter Server subprocess (known token,
 * free port, notebook root = current working directory). Set
 * ORION_JUPYTER_EXTERNAL=1 to use an existing server via NEXT_PUBLIC_JUPYTER_URL
 * and NEXT_PUBLIC_JUPYTER_TOKEN instead.
 *
 * Run from the repo root:
 *   npx tsx lib/agent/tools/__tests__/tools-integration.test.ts
 */

import { KernelService } from "@/lib/kernel/kernel-service";
import {
  createJupyterTools,
  NotebookManager,
  type JupyterToolSet,
} from "../index";
import type { MultimodalToolResult } from "../types";
import { startEmbeddedJupyterServer } from "./jupyter-test-server";

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_NOTEBOOK_NAME = "test-tools-notebook";
const TEST_NOTEBOOK_PATH = "test_tools_integration.ipynb";

/** Separate notebook used for read_cell_output tests (has real cell outputs) */
const OUTPUT_NOTEBOOK_NAME = "test-cell-output-notebook";
const OUTPUT_NOTEBOOK_PATH = "test_cell_output_integration.ipynb";

/** Plain text file used for read_file / edit_file tests */
const TEST_FILE_PATH = "test_tools_integration_script.py";
const SIDEBAR_KERNEL_NOTEBOOK_PATH = "test_sidebar_kernel_listing.ipynb";
const SIDEBAR_REMOTE_KERNEL_NOTEBOOK_PATH =
  "test_sidebar_remote_kernel_listing.ipynb";

// ============================================================================
// Test Harness (no external test framework dependency)
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`  ✓ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    results.push({
      name,
      passed: false,
      error: errorMsg,
      duration: Date.now() - start,
    });
    console.log(`  ✗ ${name} (${Date.now() - start}ms)`);
    console.log(`    Error: ${errorMsg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertIncludes(text: string, substring: string, label?: string): void {
  if (!text.includes(substring)) {
    throw new Error(
      `${label || "Text"} should include "${substring}" but got: "${text.substring(0, 200)}..."`
    );
  }
}

function assertNotIncludes(text: string, substring: string, label?: string): void {
  if (text.includes(substring)) {
    throw new Error(`${label ?? "Text"} should NOT include "${substring}"`);
  }
}

// ============================================================================
// Tests
// ============================================================================

async function main() {
  let embeddedDispose: (() => void) | undefined;
  /** Retained for shutdown in `finally` (may be undefined if setup throws before assignment). */
  let kernelForShutdown: KernelService | undefined;

  try {
    const useExternal = process.env.ORION_JUPYTER_EXTERNAL === "1";
    let jupyterUrl: string;
    let jupyterToken: string;

    if (useExternal) {
      jupyterUrl =
        process.env.NEXT_PUBLIC_JUPYTER_URL || "http://localhost:8888";
      jupyterToken = process.env.NEXT_PUBLIC_JUPYTER_TOKEN || "";
    } else {
      console.log(
        "Starting embedded Jupyter Server (set ORION_JUPYTER_EXTERNAL=1 to use NEXT_PUBLIC_JUPYTER_* instead)...\n"
      );
      const embedded = await startEmbeddedJupyterServer({
        cwd: process.cwd(),
      });
      jupyterUrl = embedded.baseUrl;
      jupyterToken = embedded.token;
      embeddedDispose = embedded.dispose;
    }

    console.log("\n=== Jupyter Notebook Tools Integration Tests ===\n");
    console.log(`Jupyter URL: ${jupyterUrl}`);
    console.log(`Token configured: ${!!jupyterToken}`);
    console.log(
      `Mode: ${useExternal ? "external (ORION_JUPYTER_EXTERNAL=1)" : "embedded subprocess"}\n`
    );

    const kernel = new KernelService({
      baseUrl: jupyterUrl,
      token: jupyterToken,
    });
    kernelForShutdown = kernel;

    // Test connection first
    const connected = await kernel.testConnection();
    if (!connected) {
      console.error(
        "Cannot connect to Jupyter server. Ensure it is running and accessible."
      );
      process.exitCode = 1;
      return;
    }

    // Create tool set
    const toolSet: JupyterToolSet = createJupyterTools(kernel, null);
    const { tools, notebookManager } = toolSet;

    // --------------------------------------------------------------------------
    // NotebookManager unit tests (no kernel needed)
    // --------------------------------------------------------------------------

    console.log("--- NotebookManager ---");

    await runTest("NotebookManager: add and get notebook", async () => {
      const mgr = new NotebookManager();
      const id = mgr.addNotebook("test", "/path/test.ipynb", "kernel-1");
      assert(typeof id === "string" && id.length > 0, "should return an ID");
      assert(mgr.has(id), "should have the returned ID");
      assert(mgr.getCurrentNotebookId() === id, "current should be the returned ID");

      const entry = mgr.get(id);
      assert(entry !== undefined, "entry should exist");
      assert(entry!.name === "test", "name should match");
      assert(entry!.path === "/path/test.ipynb", "path should match");
      assert(entry!.kernelId === "kernel-1", "kernelId should match");
    });

    await runTest("NotebookManager: remove and switch current", async () => {
      const mgr = new NotebookManager();
      const id1 = mgr.addNotebook("nb1", "/path/nb1.ipynb", "k1");
      const id2 = mgr.addNotebook("nb2", "/path/nb2.ipynb", "k2");
      mgr.setCurrentNotebook(id1);

      assert(mgr.removeNotebook(id1), "should remove nb1");
      assert(mgr.getCurrentNotebookId() === id2, "should switch to id2");
      assert(!mgr.has(id1), "id1 should be gone");
    });

    await runTest("NotebookManager: listAll includes isCurrent", async () => {
      const mgr = new NotebookManager();
      const idA = mgr.addNotebook("a", "/a.ipynb", "k1");
      const idB = mgr.addNotebook("b", "/b.ipynb", "k2");
      mgr.setCurrentNotebook(idB);

      const list = mgr.listAll();
      assert(list.length === 2, "should have 2 notebooks");
      const bEntry = list.find((nb) => nb.id === idB);
      assert(bEntry?.isCurrent === true, "b should be current");
      assert(bEntry?.name === "b", "name should be carried through");
      assert(idA !== idB, "IDs should be unique");
    });

    // --------------------------------------------------------------------------
    // Server Management Tools (require running Jupyter server)
    // --------------------------------------------------------------------------

    console.log("\n--- Server Management ---");

    await runTest("ListKernelsTool: returns formatted output", async () => {
      const result = await tools.listKernels.execute();
      // May be empty if no kernels running, but should not error
      assert(typeof result === "string", "should return string");
    });

    await runTest(
      "KernelService: getRunningKernelsForSidebar includes session metadata",
      async () => {
        const startedKernel = await kernel.startKernel(
          "python3",
          SIDEBAR_KERNEL_NOTEBOOK_PATH
        );
        try {
          const runningKernels = await kernel.getRunningKernelsForSidebar();
          const matchingKernel = runningKernels.find(
            (kernel) => kernel.kernelId === startedKernel.id
          );

          assert(!!matchingKernel, "started kernel should appear in sidebar list");
          assert(
            matchingKernel?.sessionPath === SIDEBAR_KERNEL_NOTEBOOK_PATH,
            "sidebar entry should keep session path"
          );
          assert(
            matchingKernel?.fileName === "test_sidebar_kernel_listing.ipynb",
            "sidebar entry should expose filename"
          );
          assert(
            typeof matchingKernel?.state === "string" && matchingKernel.state.length > 0,
            "sidebar entry should expose kernel state"
          );

          const uniqueKernelIds = new Set(
            runningKernels.map((kernel) => kernel.kernelId)
          );
          assert(
            uniqueKernelIds.size === runningKernels.length,
            "sidebar list should be deduped by kernel ID"
          );
        } finally {
          try {
            await kernel.shutdownKernelById(startedKernel.id);
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    );

    await runTest(
      "KernelService: connect/shutdown by kernel ID works for untracked server kernel",
      async () => {
        const remoteKernelService = new KernelService({
          baseUrl: jupyterUrl,
          token: jupyterToken,
        });
        let remoteKernelId = "";

        try {
          const remoteConnected = await remoteKernelService.testConnection();
          assert(remoteConnected, "secondary kernel service should connect");

          const remoteKernel = await remoteKernelService.startKernel(
            "python3",
            SIDEBAR_REMOTE_KERNEL_NOTEBOOK_PATH
          );
          remoteKernelId = remoteKernel.id;

          assert(
            !kernel
              .listActiveSessions()
              .some((session) => session.kernelId === remoteKernelId),
            "kernel should start as untracked in the primary service"
          );

          const beforeConnect = await kernel.getRunningKernelsForSidebar();
          assert(
            beforeConnect.some((kernel) => kernel.kernelId === remoteKernelId),
            "server-backed sidebar list should include untracked kernels"
          );

          await kernel.connectToKernel(remoteKernelId);
          assert(
            kernel
              .listActiveSessions()
              .some((session) => session.kernelId === remoteKernelId),
            "connectToKernel should track the previously untracked kernel"
          );

          await kernel.shutdownKernelById(remoteKernelId);
          const afterShutdown = await kernel.getRunningKernelsForSidebar();
          assert(
            !afterShutdown.some((kernel) => kernel.kernelId === remoteKernelId),
            "shutdownKernelById should remove kernel from server list"
          );
        } finally {
          if (remoteKernelId) {
            try {
              await remoteKernelService.shutdownKernelById(remoteKernelId);
            } catch {
              // Ignore cleanup errors
            }
          }
          remoteKernelService.dispose();
        }
      }
    );

    await runTest("BashTool: runs command in persistent terminal", async () => {
      const result = await tools.bash.execute({
        command: "pwd",
        description: "Verify bash tool terminal access",
        terminalName: "",
        cwd: "",
        background: false,
      });
      assert(typeof result === "string", "should return string");
      assertIncludes(result, "status:", "should use structured terminal result fields");
      assertIncludes(result, "status: completed", "should complete simple command");
      assertIncludes(result, "exit_code: 0", "should include successful exit code");
    });

    // --------------------------------------------------------------------------
    // Notebook Management Tools
    // --------------------------------------------------------------------------

    console.log("\n--- Notebook Management ---");

    let testNotebookId = "";

    await runTest("UseNotebookTool: create new notebook", async () => {
      const result = await tools.useNotebook.execute({
        notebookName: TEST_NOTEBOOK_NAME,
        notebookPath: TEST_NOTEBOOK_PATH,
        mode: "create",
        kernelId: "",
      });

      assert(typeof result === "string", "should return string");
      assertIncludes(result, "Successfully activated", "should confirm activation");
      const found = notebookManager.getByPath(TEST_NOTEBOOK_PATH);
      assert(found !== null, "notebook should be in manager");
      testNotebookId = found!.id;
    });

    await runTest("UseNotebookTool: prevents duplicate create", async () => {
      const result = await tools.useNotebook.execute({
        notebookName: TEST_NOTEBOOK_NAME,
        notebookPath: TEST_NOTEBOOK_PATH,
        mode: "create",
        kernelId: "",
      });

      assertIncludes(result, "already registered", "should warn about duplicate");
    });

    await runTest("ListNotebooksTool: shows managed notebook", async () => {
      const result = await tools.listNotebooks.execute();
      assertIncludes(result, TEST_NOTEBOOK_NAME, "should list our notebook");
      assertIncludes(result, TEST_NOTEBOOK_PATH, "should show path");
    });

    await runTest(
      "ReadNotebookTool: reads notebook cells (brief)",
      async () => {
        const result = await tools.readNotebook.execute({
          notebookId: testNotebookId,
          responseFormat: "brief",
          startIndex: 0,
          limit: 50,
          includeOrionMetadata: false,
        });

        assertIncludes(result, "cells", "should mention cell count");
      }
    );

    // --------------------------------------------------------------------------
    // Cell Operation Tools
    // --------------------------------------------------------------------------

    console.log("\n--- Cell Operations ---");

    await runTest("InsertCellTool: insert code cell", async () => {
      const result = await tools.insertCell.execute({
        cells: [
          {
            cellType: "code",
            cellSource: 'print("Hello from Orion tools test!")',
          },
        ],
        startIndex: -1,
      });

      assertIncludes(result, "inserted successfully", "should confirm insertion");
    });

    await runTest("InsertCellTool: insert markdown cell at index 0", async () => {
      const result = await tools.insertCell.execute({
        cells: [
          {
            cellType: "markdown",
            cellSource: "# Integration Test\nThis notebook was created by tests.",
          },
        ],
        startIndex: 0,
      });

      assertIncludes(result, "inserted successfully", "should confirm insertion");
    });

    await runTest("ReadCellTool: read inserted code cell", async () => {
      // The code cell should be at index 2 now (markdown at 0, original at 1, code at 2)
      const result = await tools.readCell.execute({
        cellIndices: [-1],
        includeOutputs: true,
        includeOrionMetadata: false,
      });

      assertIncludes(result, "print", "should contain the print statement");
    });

    await runTest("OverwriteCellSourceTool: overwrite cell source", async () => {
      // Get the notebook to find the last code cell index
      const notebook = await tools.readNotebook.execute({
        notebookId: "",
        responseFormat: "brief",
        startIndex: 0,
        limit: 100,
        includeOrionMetadata: false,
      });
      // Find the last cell index from the output
      const cells = notebook.split("\n");
      const lastCellLine = cells.filter((l) => l.match(/^\d+\t/)).pop();
      const lastIndex = lastCellLine ? parseInt(lastCellLine.split("\t")[0]) : 2;

      const result = await tools.overwriteCellSource.execute({
        cells: [
          {
            cellIndex: lastIndex,
            newSource: 'x = 42\nprint(f"The answer is {x}")',
          },
        ],
      });

      assertIncludes(result, "overwritten successfully", "should confirm overwrite");
    });

    await runTest("InsertCellTool: insert multiple cells at once", async () => {
      const result = await tools.insertCell.execute({
        cells: [
          { cellType: "markdown", cellSource: "## Section A" },
          { cellType: "code", cellSource: "a = 1" },
          { cellType: "code", cellSource: "b = 2" },
        ],
        startIndex: -1,
      });

      assertIncludes(result, "3 cells inserted successfully", "should confirm multiple insertions");
    });

    await runTest("ExecuteCellTool: execute code cell", async () => {
      // Execute the last cell (the overwritten one)
      const notebook = await tools.readNotebook.execute({
        notebookId: "",
        responseFormat: "brief",
        startIndex: 0,
        limit: 100,
        includeOrionMetadata: false,
      });
      const cells = notebook.split("\n");
      const lastCellLine = cells.filter((l) => l.match(/^\d+\t/)).pop();
      const lastIndex = lastCellLine ? parseInt(lastCellLine.split("\t")[0]) : 2;

      const result = await tools.executeCell.execute({
        cellIndices: [lastIndex],
        timeoutSeconds: 30,
        stream: false,
        progressInterval: 2000,
      });

      assert(Array.isArray(result), "should return array of outputs");
      // Should have some output from the print statement
      const outputText = result.join("\n");
      assertIncludes(outputText, "42", "should contain the computed value");
    });

    await runTest("ExecuteCodeTool: execute arbitrary code", async () => {
      const result = await tools.executeCode.execute({
        code: "import sys; print(sys.version)",
        timeoutSeconds: 15,
      });

      assert(typeof result === "string", "should return string");
      // Should contain Python version info
      assert(result.length > 0, "should have some output");
    });

    await runTest("DeleteCellTool: delete a cell", async () => {
      const result = await tools.deleteCell.execute({
        cellIndices: [0],
        includeSource: true,
      });

      assertIncludes(result, "deleted successfully", "should confirm deletion");
      assertIncludes(result, "markdown", "should show deleted cell type");
    });

    // --------------------------------------------------------------------------
    // File Tools: read_file / edit_file
    // --------------------------------------------------------------------------

    console.log("\n--- File Tools: read_file / edit_file ---");

    await runTest("edit_file (overwrite): creates a new file", async () => {
      const result = await tools.editFile.execute({
        filePath: TEST_FILE_PATH,
        mode: "overwrite",
        content: "# integration test\nx = 1\ny = 2\nprint(x + y)\n",
        oldString: "",
        newString: "",
      });
      assert(typeof result === "string", "should return string");
      assertIncludes(result, "saved successfully", "should confirm save");
    });

    await runTest("read_file: reads full file with line numbers", async () => {
      const result = await tools.readFile.execute({
        filePath: TEST_FILE_PATH,
        startLine: 0,
        endLine: 0,
      });
      assertIncludes(result, "integration test", "should include file content");
      assertIncludes(result, "   1", "should have line numbers");
    });

    await runTest("read_file: slices a line range", async () => {
      const result = await tools.readFile.execute({
        filePath: TEST_FILE_PATH,
        startLine: 1,
        endLine: 2,
      });
      assertIncludes(result, "x = 1", "should include line 2");
      assertNotIncludes(result, "integration test", "should not include line 1");
    });

    await runTest("read_file: returns error for non-existent file", async () => {
      const result = await tools.readFile.execute({
        filePath: "does_not_exist_xyz.py",
        startLine: 0,
        endLine: 0,
      });
      assertIncludes(result, "[ERROR]", "should return error");
    });

    await runTest("edit_file (replace): patches an existing string", async () => {
      const result = await tools.editFile.execute({
        filePath: TEST_FILE_PATH,
        mode: "replace",
        content: "",
        oldString: "x = 1\ny = 2",
        newString: "x = 10\ny = 20",
      });
      assertIncludes(result, "saved successfully", "should confirm save");
      const readBack = await tools.readFile.execute({ filePath: TEST_FILE_PATH, startLine: 0, endLine: 0 });
      assertIncludes(readBack, "x = 10", "patched value should be in file");
      assertNotIncludes(readBack, "x = 1\n", "old value should be gone");
    });

    await runTest("edit_file (replace): errors when oldString not found", async () => {
      const result = await tools.editFile.execute({
        filePath: TEST_FILE_PATH,
        mode: "replace",
        content: "",
        oldString: "this_string_does_not_exist_at_all",
        newString: "replacement",
      });
      assertIncludes(result, "[ERROR]", "should return error");
      assertIncludes(result, "not found", "should say not found");
    });

    await runTest("edit_file (replace): errors when oldString matches multiple times", async () => {
      await tools.editFile.execute({
        filePath: TEST_FILE_PATH,
        mode: "overwrite",
        content: "a = 1\na = 1\n",
        oldString: "",
        newString: "",
      });
      const result = await tools.editFile.execute({
        filePath: TEST_FILE_PATH,
        mode: "replace",
        content: "",
        oldString: "a = 1",
        newString: "a = 99",
      });
      assertIncludes(result, "[ERROR]", "should return error");
      assertIncludes(result, "multiple", "should mention multiple matches");
    });

    // --------------------------------------------------------------------------
    // Cell Output Tool: read_cell_output
    // --------------------------------------------------------------------------

    console.log("\n--- Cell Output Tool: read_cell_output ---");

    let outputNotebookId = "";

    // Create a dedicated notebook with cells producing various output types
    await runTest("read_cell_output setup: create output notebook", async () => {
      const result = await tools.useNotebook.execute({
        notebookName: OUTPUT_NOTEBOOK_NAME,
        notebookPath: OUTPUT_NOTEBOOK_PATH,
        mode: "create",
        kernelId: "",
      });
      assertIncludes(result, "Successfully activated", "should create notebook");
      const found = notebookManager.getByPath(OUTPUT_NOTEBOOK_PATH);
      if (found) outputNotebookId = found.id;
    });

    await runTest("read_cell_output setup: insert and execute output cells", async () => {
      await tools.insertCell.execute({
        cells: [
          { cellType: "code", cellSource: 'print("hello from cell 0")' },
          { cellType: "code", cellSource: "6 * 7" },
          {
            cellType: "code",
            cellSource: [
              "import pandas as pd",
              "pd.DataFrame({'name': ['Alice', 'Bob'], 'score': [95, 87]})",
            ].join("\n"),
          },
          {
            cellType: "code",
            cellSource: [
              "import matplotlib; matplotlib.use('Agg')",
              "import matplotlib.pyplot as plt",
              "fig, ax = plt.subplots()",
              "ax.plot([1, 2, 3], [4, 5, 6])",
              "plt.show()",
            ].join("\n"),
          },
          {
            cellType: "code",
            cellSource: [
              "import plotly.graph_objects as go",
              "fig = go.Figure(go.Scatter(x=[1,2,3], y=[10,20,15], name='Rev'))",
              "fig.update_layout(title='Q1', xaxis_title='Month', yaxis_title='$')",
              "fig.show()",
            ].join("\n"),
          },
          { cellType: "code", cellSource: "raise ValueError('test error')" },
        ],
        startIndex: -1,
      });
      const execResult = await tools.executeCell.execute({
        cellIndices: [0, 1, 2, 3, 4, 5],
        timeoutSeconds: 60,
        stream: false,
        progressInterval: 2000,
      });
      assert(Array.isArray(execResult), "executeCell should return array");
    });

    await runTest("read_cell_output: stream (stdout) returns text", async () => {
      const result = await tools.readCellOutput.execute({ reads: [{ cellIndex: 0, outputIndex: 0 }] });
      assertIncludes(result as string, "hello from cell 0", "should include print output");
    });

    await runTest("read_cell_output: execute_result number returns value", async () => {
      const result = await tools.readCellOutput.execute({ reads: [{ cellIndex: 1, outputIndex: 0 }] });
      assertIncludes(result as string, "42", "should include computed value");
    });

    await runTest("read_cell_output: DataFrame HTML returns TSV table", async () => {
      const result = await tools.readCellOutput.execute({ reads: [{ cellIndex: 2, outputIndex: 0 }] });
      assertIncludes(result as string, "name", "should include column name");
      assertIncludes(result as string, "Alice", "should include row data");
    });

    await runTest("read_cell_output: matplotlib PNG returns MultimodalToolResult", async () => {
      const result = await tools.readCellOutput.execute({ reads: [{ cellIndex: 3, outputIndex: 0 }] });
      assert(typeof result === "object" && result !== null, "should return object for PNG");
      const multi = result as MultimodalToolResult;
      assert("images" in multi, "should have images field");
      assert(multi.images[0].mimeType === "image/png", "should be PNG");
      assert(multi.images[0].data.length > 100, "image data should be non-empty");
    });

    await runTest("read_cell_output: Plotly returns structured summary", async () => {
      const result = await tools.readCellOutput.execute({ reads: [{ cellIndex: 4, outputIndex: 0 }] });
      assertIncludes(result as string, "[Plotly Chart]", "should label as Plotly");
      assertIncludes(result as string, "Q1", "should include chart title");
      assertIncludes(result as string, "Rev", "should include trace name");
    });

    await runTest("read_cell_output: error output includes ename and evalue", async () => {
      const result = await tools.readCellOutput.execute({ reads: [{ cellIndex: 5, outputIndex: 0 }] });
      assertIncludes(result as string, "ValueError", "should include ename");
      assertIncludes(result as string, "test error", "should include evalue");
    });

    await runTest("read_cell_output: out-of-range cell returns error", async () => {
      const result = await tools.readCellOutput.execute({ reads: [{ cellIndex: 999, outputIndex: 0 }] });
      assertIncludes(result as string, "[ERROR]", "should return [ERROR]");
    });

    // --------------------------------------------------------------------------
    // Cleanup: Restart & Unuse
    // --------------------------------------------------------------------------

    console.log("\n--- Cleanup ---");

    await runTest("RestartNotebookTool: restart kernel", async () => {
      const result = await tools.restartNotebook.execute({
        notebookId: testNotebookId,
      });

      assertIncludes(result, "restarted successfully", "should confirm restart");
    });

    await runTest("UnuseNotebookTool: remove main test notebook", async () => {
      const result = await tools.unuseNotebook.execute({
        notebookId: testNotebookId,
      });

      assertIncludes(result, "unused successfully", "should confirm removal");
      assert(
        !notebookManager.has(testNotebookId),
        "notebook should be removed from manager"
      );
    });

    await runTest("UnuseNotebookTool: remove output test notebook", async () => {
      if (!outputNotebookId || !notebookManager.has(outputNotebookId)) return; // not created if setup failed
      const result = await tools.unuseNotebook.execute({
        notebookId: outputNotebookId,
      });
      assertIncludes(result, "unused successfully", "should confirm removal");
    });

    // Clean up all test files created during the run
    const contents = kernel.getContentsManager();
    for (const path of [
      TEST_NOTEBOOK_PATH,
      OUTPUT_NOTEBOOK_PATH,
      TEST_FILE_PATH,
      SIDEBAR_KERNEL_NOTEBOOK_PATH,
      SIDEBAR_REMOTE_KERNEL_NOTEBOOK_PATH,
    ]) {
      try {
        await contents.delete(path);
        console.log(`  Cleaned up: ${path}`);
      } catch {
        console.log(`  [WARNING] Could not delete: ${path}`);
      }
    }

    // --------------------------------------------------------------------------
    // Summary
    // --------------------------------------------------------------------------

    console.log("\n=== Test Summary ===\n");
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    const total = results.length;

    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);

    if (failed > 0) {
      console.log("\nFailed tests:");
      for (const r of results.filter((r) => !r.passed)) {
        console.log(`  - ${r.name}: ${r.error}`);
      }
      process.exitCode = 1;
    } else {
      console.log("\nAll tests passed!\n");
    }

  } finally {
    try {
      await kernelForShutdown?.shutdown();
    } catch {
      // Ignore shutdown errors
    }
    embeddedDispose?.();
  }
}

// Run tests
main().catch((error) => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
