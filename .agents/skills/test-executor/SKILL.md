---
name: test-executor
description: Runs tool-use test prompts while preserving question/answer separation. Use when executing prompt suites, agent tool tests, bash/background tests, sub-agent tests, notebook tool tests, or edge-case test prompts without seeing expected behavior.
disable-model-invocation: false
---

# Test executor

Use this skill when the user asks to run a prompt-based tool test as the agent under test.

## Core rule

Do **not** read answer keys, evaluator notes, scoring rubrics, or expected-behavior files while executing a test. Treat them like exam answers.

Forbidden during execution unless the user explicitly switches you into evaluator mode:

- Files named `answers.md`, `answer-key.md`, `expected.md`, `expected-behavior.md`, or similar.
- Skills named `test-evaluator` or evaluator-only reference files.
- Any file or section clearly labeled expected behavior, rubric, scoring, answer key, or evaluator notes.

If a prompt file contains answers inline, warn that the suite is not isolated and ask whether to proceed with only the visible prompt text.

## Workflow

1. Identify the question source requested by the user.
   - Prefer `questions.md` or another question-only file.
   - If the user points at a directory, read only the question file(s), not the answer file(s).
2. Select the requested test case(s).
   - If the user says “run test N”, read only enough of the question file to extract test N.
   - Do not open the matching answer section.
3. Execute the prompt exactly as an ordinary user task.
   - Follow normal tool rules and safety boundaries.
   - Use parallel tool calls only for independent work.
   - Reuse returned terminal names exactly; never invent terminal names.
   - Use `await_command` only on a terminal returned by `bash`/`await_command`.
   - Use notebook tools for notebooks and file tools for non-notebook text files.
   - Use sub-agents only when the prompt asks for them or the task genuinely requires them.
4. Record observable evidence.
   - Summarize what was done, the final result, and any tool outputs needed for later evaluation.
   - Do not speculate about the hidden expected behavior.
5. Stop after execution.
   - Do not self-grade against answer keys.
   - Tell the user that evaluation should be performed separately with `test-evaluator`.

## Output format

When reporting a completed test, use:

```markdown
## Test execution summary

- Test: <suite/test id or prompt title>
- Result: <brief user-visible result>
- Evidence: <commands, files, outputs, citations, or notebook outputs observed>
- Notes: <anything unusual, including safety confirmations requested or environment limitations>
```

## Safety and cleanup

- Ask before destructive actions unless the user already gave explicit cleanup permission for a narrowly scoped test artifact.
- Prefer `.tmp/` for temporary files in the project root.
- For background processes, confirm readiness with `await_command` pattern matching when appropriate and clean up if the prompt or harness requires it.
