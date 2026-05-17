---
name: test-evaluator
description: Evaluates tool-use test executions against separated answer keys. Use when grading an agent run, comparing execution transcripts to expected behavior, scoring prompt-suite results, or auditing whether the executor avoided answer files.
disable-model-invocation: false
---

# Test evaluator

Use this skill when the user asks to grade or audit a completed test execution. Unlike `test-executor`, this skill may read answer keys and scoring rubrics.

## Inputs to collect

1. The question file or prompt suite used by the executor.
2. The matching answer key / expected-behavior file.
3. The execution transcript, tool-call log, notebook state, changed files, or user-provided summary.

If any input is missing, ask for the specific missing item. Do not invent tool calls or outcomes.

## Workflow

1. Read the relevant question prompt(s).
2. Read the matching answer key / expected behavior.
3. Inspect the execution evidence.
   - Tool-call sequence and arguments.
   - Terminal names and `await_command` reuse.
   - Whether independent work was parallelized where expected.
   - Whether notebook operations used notebook tools.
   - Whether sub-agent calls used valid sub-agent names and reconnect paths.
   - Whether background jobs used `background: true` and readiness patterns when appropriate.
   - Whether non-notebook files used file tools or safe shell commands.
   - Whether destructive actions asked for confirmation when required.
4. Check answer-boundary compliance.
   - Passing executors must not read answer keys or evaluator-only skills during execution.
   - If the transcript shows answer-key access before or during execution, mark the affected test `fail` even if the final task result is correct.
5. Assign a score for each test: `pass`, `partial`, or `fail`.
6. Provide concise evidence for each score.

## Evaluation output format

```markdown
# Test evaluation

| Test | Score | Evidence | Notes |
|---|---|---|---|
| <id/title> | pass/partial/fail | <specific observed behavior> | <missing or notable details> |

## Summary

- Passed: <n>
- Partial: <n>
- Failed: <n>
- Answer-boundary violations: <none or list>

## Recommended fixes

- <actionable improvements for executor behavior or prompt design>
```

## Scoring guidance

- `pass`: The executor completed the user-visible task and matched the expected tool-use pattern.
- `partial`: The user-visible task was completed, but one important tool-use expectation was missed.
- `fail`: The task was not completed, a key safety/tool constraint was violated, or the executor read answer-key material.

Prefer strict scoring for tool-contract violations such as invented terminal names, re-running commands after `status: running`, editing `.ipynb` files with text tools, or using unavailable sub-agent names.

## Separation rules

- Evaluators may read answer files; executors may not.
- Do not add expected behavior to question files during fixes.
- If a suite mixes questions and answers in one file, recommend splitting it into separate `questions.md` and `answers.md` files before future execution.
