/**
 * Unit tests for right-sidebar streaming Markdown splitting.
 *
 * Run with:
 *   npx tsx components/right-sidebar/__tests__/streaming-markdown.test.ts
 */

import { splitStreamingMarkdown } from "../streaming-markdown";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

/** Run one assertion block and record its result for the final summary. */
async function runTest(name: string, fn: () => Promise<void> | void): Promise<void> {
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

/** Assert exact string equality with a compact failure message. */
function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Assert that stable Markdown and tail text do not both own the same active content. */
function assertNoOverlap(content: string): void {
  const split = splitStreamingMarkdown(content);
  if (split.stable === content && split.tail === content) {
    throw new Error(`split duplicated the full content: ${JSON.stringify(split)}`);
  }
  if (split.stable && split.tail && split.stable.endsWith(split.tail)) {
    throw new Error(`split duplicated the active tail in stable markdown: ${JSON.stringify(split)}`);
  }
}

/** Execute all streaming Markdown splitter tests. */
async function main(): Promise<void> {
  await runTest("keeps first partial paragraph entirely in the tail", () => {
    const split = splitStreamingMarkdown("Streaming text");

    assertEqual(split.stable, "", "stable");
    assertEqual(split.tail, "Streaming text", "tail");
  });

  await runTest("splits completed paragraph from active paragraph", () => {
    const split = splitStreamingMarkdown("First paragraph.\n\nSecond paragraph");

    assertEqual(split.stable, "First paragraph.", "stable");
    assertEqual(split.tail, "Second paragraph", "tail");
  });

  await runTest("keeps unfinished code fence in the tail", () => {
    const split = splitStreamingMarkdown("Intro\n\n```ts\nconst value = 1;");

    assertEqual(split.stable, "Intro", "stable");
    assertEqual(split.tail, "```ts\nconst value = 1;", "tail");
  });

  await runTest("includes closed code fence in the stable markdown", () => {
    const source = "Intro\n\n```ts\nconst value = 1;\n```\n";
    const split = splitStreamingMarkdown(source);

    assertEqual(split.stable, "Intro\n\n```ts\nconst value = 1;\n```", "stable");
    assertEqual(split.tail, "", "tail");
  });

  await runTest("keeps partial table row in the tail while rendering completed rows", () => {
    const split = splitStreamingMarkdown(
      "Before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 |"
    );

    assertEqual(split.stable, "Before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |", "stable");
    assertEqual(split.tail, "| 3 |", "tail");
  });

  await runTest("keeps partial list item in the tail", () => {
    const split = splitStreamingMarkdown("- one\n- tw");

    assertEqual(split.stable, "- one", "stable");
    assertEqual(split.tail, "- tw", "tail");
  });

  await runTest("does not overlap text across stable markdown and tail", () => {
    assertNoOverlap("First paragraph.\n\nSecond paragraph");
    assertNoOverlap("- one\n- two\n- th");
    assertNoOverlap("| A | B |\n| --- | --- |\n| 1 |");
  });

  const failed = results.filter((result) => !result.passed);
  const passed = results.length - failed.length;

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
