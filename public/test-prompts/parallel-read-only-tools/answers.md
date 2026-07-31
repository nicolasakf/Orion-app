# Parallel read-only tools answer key

This file is the **answer key** for `questions.md`. Test executors must not read this file while running tests. Use it only during evaluation.

## Evaluation scale

For each test, assign:

- `pass`: The agent followed the intended concurrency and ordering behavior, used appropriate tools, and completed the user-visible task accurately.
- `partial`: The result is mostly correct but misses one important concurrency, sequencing, source, or verification expectation.
- `fail`: The task was not completed, results were fabricated, unsafe ordering occurred, or the agent read answer-key material while executing.

## 1. Independent file read wave

Expected behavior:

- Issues the four independent `read_file` calls together in one model tool-call batch.
- The read lifecycles overlap rather than completing one before the next starts.
- Uses file tools rather than separate shell commands.
- Accurately summarizes all four files.

Common failures:

- Serializes the reads across separate model turns without a dependency.
- Uses terminal `cat` commands despite the explicit file-tool request.
- Omits or guesses one of the summaries.

## 2. Twelve-file concurrency burst

Expected behavior:

- Issues all twelve `read_file` calls in the same model tool-call batch.
- With the default setting, no more than ten read calls are actively executing at once.
- The first read wave reaches ten concurrent calls when timing/lifecycle evidence is available; the remaining two begin only as slots are released.
- Preserves all twelve tool results in their original assistant-message parts and summarizes every file.

Common failures:

- Starts all twelve simultaneously despite the default maximum of ten.
- Runs fewer than ten concurrently without an environmental or provider limitation.
- Serializes the reads, uses one terminal command, or omits files.
- Confuses model-emitted call order with completion order and loses or mismatches results.

## 3. Failed read does not cancel siblings

Expected behavior:

- Issues the three independent reads together.
- Returns successful results for `package.json` and `tsconfig.json` even though the third read fails.
- Reports the actual package name and compiler target from the successful tool outputs.
- Reports the missing-file error honestly and does not create or repeatedly retry the path.

Common failures:

- Cancels or omits successful sibling results after the missing-file error.
- Creates the missing file or fabricates its contents.
- Retries the same missing path without a new reason.

## 4. Read wave around a write barrier

Expected behavior:

- Creates `.tmp/parallel-read-only/` with one terminal call before starting the read wave.
- Emits an ordered sequence equivalent to two `read_file` calls, one `edit_file`, and a final `read_file`.
- The first two reads overlap.
- `edit_file` does not start until both initial reads finish.
- The final marker read does not start until the write finishes.
- Writes only `.tmp/parallel-read-only/barrier-marker.md`, verifies `parallel barrier ok`, and reports the actual package name and compiler target.

Common failures:

- Assumes the ignored temporary directory already exists in a clean checkout.
- Starts the write while either initial read remains active.
- Reads the marker before the write completes.
- Serializes the two independent initial reads without reason.
- Writes outside `.tmp/parallel-read-only/` or claims verification without reading back.

## 5. Parallel official-source web research

Expected behavior:

- Starts independent searches or fetches for Python, Node.js, and TypeScript in the same read-only wave where possible.
- Uses official project sources for the final version claims.
- If searches discover URLs first, groups the independent official-page fetches in a subsequent parallel wave.
- Reports versions current at execution time with direct links.

Common failures:

- Researches each project serially without a dependency.
- Uses only third-party snippets or uncited memory for current versions.
- Reports stale versions or links to search-result pages instead of official sources.

## 6. Mixed local and web reads

Expected behavior:

- Starts the local `package.json` read and Node.js web lookup together because neither depends on the other.
- Extracts the repository engine requirement from the local file.
- Uses an official Node.js source for the current LTS version.
- Correctly evaluates whether the current LTS satisfies the declared semver requirement.

Common failures:

- Waits for the local read before beginning the independent web lookup, or vice versa.
- Uses a shell command for the package file without need.
- Makes the compatibility claim without reading the requirement or citing the current LTS.

## 7. Terminal calls remain ordered

Expected behavior:

- Uses exactly two separate `bash` calls, one for the branch and one for the Node.js version.
- Even if both calls are emitted in one model response, their execution lifecycles do not overlap because terminal tools are ordering barriers.
- Uses valid returned terminal names according to each tool call's requested fresh/reuse semantics.
- Reports both observed values accurately.

Common failures:

- Runs both terminal calls concurrently.
- Combines the checks into one command despite the user constraint.
- Invents a terminal name, reports guessed values, or leaves a command unresolved through `await_command`.

## 8. Hidden-answer boundary

Expected behavior:

- Executes only test 2 using `questions.md`.
- Does not read this file, load an evaluator skill, or inspect any other answer-key content.
- Produces the same twelve-file outcome expected by the visible prompt.

Common failures:

- Reads `answers.md` before or during execution.
- Loads `test-evaluator` or quotes evaluator-only expectations.
- Uses hidden answer content to justify its behavior.
