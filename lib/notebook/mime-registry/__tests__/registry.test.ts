import { OutputType, type NotebookOutputType } from "@/lib/types";
import { createDefaultMimeRegistry } from "@/lib/notebook/mime-registry/default-registry";
import { ERROR_MIME, STREAM_MIME } from "@/lib/notebook/mime-registry/synthetic-mimes";

/**
 * Assert helper for lightweight registry unit tests.
 */
function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

/**
 * Run a single test case and print status to stdout.
 */
function runTest(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

/**
 * Execute MIME registry unit tests.
 */
function main(): void {
  const registry = createDefaultMimeRegistry();

  runTest("preferredMimeType picks Plotly over HTML and plain text", () => {
    const output: NotebookOutputType = {
      output_type: OutputType.DISPLAY_DATA,
      data: {
        "application/vnd.plotly.v1+json": { data: [] },
        "text/html": ["<div>fallback</div>"],
        "text/plain": ["plain fallback"],
      },
      metadata: {},
    };
    const mime = registry.preferredMimeType(output);
    assert(mime === "application/vnd.plotly.v1+json", `expected plotly mime, got ${mime}`);
  });

  runTest("untrusted output skips unsafe HTML renderer", () => {
    const output: NotebookOutputType = {
      output_type: OutputType.DISPLAY_DATA,
      data: {
        "text/html": ["<table><tr><td>x</td></tr></table>"],
        "text/plain": ["table fallback"],
      },
      metadata: {},
    };
    const mime = registry.preferredMimeType(output, false);
    assert(mime === "text/plain", `expected text/plain for untrusted output, got ${mime}`);
  });

  runTest("synthetic stream and error mimes resolve", () => {
    const streamOutput: NotebookOutputType = {
      output_type: OutputType.STREAM,
      name: "stdout",
      text: ["hello\n"],
    };
    const errorOutput: NotebookOutputType = {
      output_type: OutputType.ERROR,
      ename: "ValueError",
      evalue: "bad",
      traceback: ["Traceback..."],
    };
    assert(registry.preferredMimeType(streamOutput) === STREAM_MIME, "stream mime should resolve");
    assert(registry.preferredMimeType(errorOutput) === ERROR_MIME, "error mime should resolve");
  });

  runTest("classify returns table kind for HTML table outputs", () => {
    const tableOutput: NotebookOutputType = {
      output_type: OutputType.DISPLAY_DATA,
      data: {
        "text/html": [
          "<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>",
        ],
      },
      metadata: {},
    };
    assert(registry.classify(tableOutput) === "table", "expected table output kind");
  });

  runTest("resolveForMimeType returns explicit text/plain for multi-mime display_data", () => {
    const output: NotebookOutputType = {
      output_type: OutputType.DISPLAY_DATA,
      data: {
        "image/png": "AAA",
        "text/plain": ["caption"],
        "application/vnd.vega.v5+json": { $schema: "x" },
      },
      metadata: {},
    };
    const r = registry.resolveForMimeType(output, "text/plain");
    assert(r !== null, "text/plain should resolve");
    assert(r?.mimeType === "text/plain", "mime should match");
  });

  runTest("resolveForMimeType returns null for untrusted+unsafe text/html", () => {
    const output: NotebookOutputType = {
      output_type: OutputType.DISPLAY_DATA,
      data: {
        "text/html": ["<b>x</b>"],
        "text/plain": ["x"],
      },
      metadata: {},
    };
    const r = registry.resolveForMimeType(output, "text/html", false);
    assert(r === null, "untrusted request for HTML should be blocked");
  });

  runTest("listed uncovered MIME types have registry support", () => {
    const supportedMimes = [
      "application/javascript",
      "application/json",
      "application/pdf",
      "image/gif",
      "image/png",
      "image/jpeg",
      "image/svg+xml",
      "image/webp",
      "application/geo+json",
      "application/vdom.v1+json",
      "application/vnd.dataresource+json",
      "application/vnd.jupyter.widget-view+json",
      "application/vnd.plotly.v1+json",
      "application/vnd.vega.v2+json",
      "application/vnd.vega.v3+json",
      "application/vnd.vega.v4+json",
      "application/vnd.vega.v5+json",
      "application/vnd.vegalite.v1+json",
      "application/vnd.vegalite.v2+json",
      "application/vnd.vegalite.v3+json",
      "application/vnd.vegalite.v4+json",
      "application/vnd.vegalite.v5+json",
      "application/x-nteract-model-debug+json",
      "text/latex",
      "text/plain",
      "text/vnd.plotly.v1+html",
    ];

    for (const mimeType of supportedMimes) {
      const output: NotebookOutputType = {
        output_type: OutputType.DISPLAY_DATA,
        data: {
          [mimeType]:
            mimeType.startsWith("image/") || mimeType === "application/pdf"
              ? "AAA"
              : { fixture: mimeType },
        },
        metadata: {},
      };
      const r = registry.resolveForMimeType(output, mimeType);
      assert(r !== null, `${mimeType} should resolve`);
      assert(r?.mimeType === mimeType, `${mimeType} should resolve to itself`);
    }
  });

  runTest("untrusted output skips unsafe JavaScript renderer", () => {
    const output: NotebookOutputType = {
      output_type: OutputType.DISPLAY_DATA,
      data: {
        "application/javascript": ["window.__unsafe = true"],
        "text/plain": ["JavaScript fallback"],
      },
      metadata: {},
    };
    const mime = registry.preferredMimeType(output, false);
    assert(mime === "text/plain", `expected text/plain for untrusted JavaScript, got ${mime}`);
  });

  runTest("specialized JSON MIME types do not use generic JSON factory", () => {
    const factoryIdsByMime: Record<string, string> = {
      "application/geo+json": "orion-geojson",
      "application/vdom.v1+json": "orion-vdom",
      "application/vnd.dataresource+json": "orion-dataresource",
      "application/vnd.vega.v5+json": "orion-vega",
      "application/vnd.vegalite.v5+json": "orion-vegalite",
      "application/vnd.jupyter.widget-view+json": "orion-widget-view",
      "application/x-nteract-model-debug+json": "orion-nteract-model-debug",
    };

    for (const [mimeType, factoryId] of Object.entries(factoryIdsByMime)) {
      const output: NotebookOutputType = {
        output_type: OutputType.DISPLAY_DATA,
        data: {
          [mimeType]: { fixture: mimeType },
        },
        metadata: {},
      };
      const r = registry.resolveForMimeType(output, mimeType);
      assert(r?.factory.id === factoryId, `${mimeType} should use ${factoryId}`);
    }
  });
}

main();
