---
name: test-creator
description: Creates prompt-based tool-use test suites under public/test-prompts with separated questions and answer keys. Use when adding agent tests, prompt suites, edge-case tests, or evaluator/executor-compatible test prompts.
disable-model-invocation: false
---

# Test creator

Use this skill when the user asks to create, expand, or revise a prompt-based test suite for Orion/agent tool behavior. Suites live under `public/test-prompts` and are designed to work with the `test-executor` and `test-evaluator` skills.

## Core rules

1. Keep questions and answers separated.
   - `questions.md` contains only user-facing prompts.
   - `answers.md` contains evaluator-only expected behavior, scoring notes, and common failures.
   - Never put expected tool calls, scoring rubrics, hidden constraints, or answer-key material in `questions.md`.
2. Default to a directory-based suite:
   - `public/test-prompts/<suite-slug>/questions.md`
   - `public/test-prompts/<suite-slug>/answers.md`
3. Use existing `public/test-prompts/tool-edge-cases/` as the canonical example before designing a new suite.
4. Design tests that are executable by an agent without reading the answer key and evaluable later from transcript/tool-call evidence.
5. Avoid destructive or environment-fragile prompts unless the test specifically targets safety behavior; include clear confirmation/cleanup expectations in `answers.md`.

## Workflow

1. Inspect the existing examples.
   - Read `public/test-prompts/tool-edge-cases/questions.md` and `public/test-prompts/tool-edge-cases/answers.md` for structure and tone.
   - Inspect nearby test prompt files if the new suite should follow an existing theme.
2. Choose a suite slug.
   - Use lowercase kebab-case, e.g. `notebook-tool-contracts` or `file-edit-safety`.
   - If updating an existing suite, preserve its slug and numbering style.
3. Draft `questions.md`.
   - Start with `# <Suite title> test prompts`.
   - Add a short note that the file contains only questions and expected behavior belongs in `answers.md`.
   - Number each test as `## 1. <Title>`, `## 2. <Title>`, etc.
   - Write prompts exactly as a user would ask them, including only visible constraints the executor should obey.
   - Include enough detail for the executor to act without seeing the answer key.
4. Draft `answers.md`.
   - Start with `# <Suite title> answer key`.
   - State that executors must not read the file during test execution.
   - Include an evaluation scale with `pass`, `partial`, and `fail`.
   - For each numbered test, include:
     - `Expected behavior:` bullet list.
     - `Common failures:` bullet list.
   - Mention answer-boundary violations as failures where relevant.
5. Validate the suite.
   - Confirm every question has a matching answer section with the same number and title.
   - Confirm no answer-key language appears in `questions.md`.
   - Confirm prompts use repository-relative paths and current workspace conventions.
   - Confirm tests leave cleanup instructions or use `.tmp/` for temporary artifacts.

## Prompt design guidelines

Good tests usually target one or two behaviors at a time:

- Tool sequencing and dependency boundaries.
- Parallel calls for independent work.
- Terminal lifecycle: background jobs, `await_command`, exact terminal reuse.
- Notebook lifecycle: `use_notebook`, cell edits, execution, output inspection, error recovery.
- File operations: text tools for non-notebook files; notebook tools for `.ipynb` files.
- Sub-agent use only when requested or genuinely required.
- Safety boundaries: destructive actions, answer-key isolation, confirmation requirements.

Prefer observable outcomes over vague intent. A future evaluator should be able to score from the transcript and final answer without guessing.

## Templates

### `questions.md`

```markdown
# <Suite title> test prompts

Use these prompts as the **questions** for manual or automated agent-tool tests. This file intentionally contains only user-facing prompts. Do not include expected tool calls, scoring notes, or answers here; keep those in `answers.md`.

## 1. <Behavior-focused title>

<User-facing prompt.>

## 2. <Behavior-focused title>

<User-facing prompt.>
```

### `answers.md`

```markdown
# <Suite title> answer key

This file is the **answer key** for `questions.md`. Test executors must not read this file while running tests. Use it only during evaluation.

## Evaluation scale

For each test, assign:

- `pass`: The agent followed the intended tool-use pattern and completed the user-visible task.
- `partial`: The task result is mostly correct but the tool-use pattern missed one important detail.
- `fail`: The task was not completed, required constraints were ignored, or the agent read this answer key while executing.

## 1. <Behavior-focused title>

Expected behavior:

- <Observable expected behavior.>
- <Tool-use or safety expectation.>

Common failures:

- <Likely mistake.>
- <Boundary violation.>
```

## Final response

After creating or updating a suite, report:

- The suite path.
- The files created or changed.
- The number of tests.
- Any assumptions, cleanup concerns, or recommended next step such as running a sample prompt with `test-executor` and grading with `test-evaluator`.
