# Path resolution answer key

This file is the **answer key** for `questions.md`. Test executors must not read this file while running tests. Use it only during evaluation.

## Evaluation scale

For each test, assign:

- `pass`: The agent used absolute host paths under the Jupyter root when the root was available (or used legacy Jupyter-relative paths only when the prompt said absolute host paths were unavailable), completed the user-visible task, and did not fabricate results after tool errors.
- `partial`: The task outcome is mostly correct but path handling showed a serious near-miss (e.g., succeeded only after multiple wrong-path errors, or used shell instead of file tools without need).
- `fail`: Wrong paths were used persistently, notebook/file tools were mixed incorrectly, out-of-sandbox content was invented, or the agent read this answer key while executing.

## General path rules (apply to all tests)

Expected behavior:

- When the system prompt provides a Jupyter root absolute path, path-like tool inputs should be **absolute host paths under that Jupyter root**.
- The Jupyter root is the access boundary, not the active workspace. Files outside the workspace but inside the Jupyter root are allowed.
- Files outside the Jupyter root should produce a clear inaccessible-path error; the agent should not bypass that boundary with unrelated shell commands.
- When the system prompt says absolute host paths are unavailable, use legacy Jupyter-root-relative paths, optionally prefixed by the active workspace directory when the workspace is a subfolder of the root.
- After a tool returns `[ERROR] Could not read file ...` or similar, the agent should adjust the path (list directory, terminal `find`/`fd`, terminal `rg`/`grep`, or similar) or report the failure honestly — not guess contents.

Common failures:

- Using Jupyter-relative paths in a local session whose prompt provides absolute root/workspace paths.
- Treating the active workspace as the access boundary and refusing an inside-root path solely because it is outside the workspace.
- Prefixing paths incorrectly so the path points to a non-existent location under the Jupyter root.
- Using `read_file` / `edit_file` on `.ipynb` files instead of notebook tools.
- Calling notebook cell tools before `use_notebook`.
- Retrying the same bad path repeatedly without diagnosis.

## 1. Root-level file read

Expected behavior:

- Reads `package.json` with `read_file` (or equivalent non-destructive access), using the absolute workspace path from the system prompt when available.
- Reports the actual `"name"` value from the file (currently `orion-notebook` in this repo — verify at evaluation time if the package was renamed).

Common failures:

- Uses the wrong path root and gets an error without recovery.
- Reads a similarly named file from the wrong directory.
- Reports a guessed package name without reading.

## 2. Nested subfolder file read

Expected behavior:

- Reads `public/test-prompts/tool-edge-cases/questions.md` successfully.
- Counts numbered sections (`## 1.` … `## 14.` → **14** at time of writing).

Common failures:

- Omits the `public/` prefix or adds an extra project-folder prefix.
- Counts all markdown headings instead of numbered test sections.
- Uses shell `cat` when `read_file` suffices.

## 3. Deep path with line range

Expected behavior:

- Reads `lib/agent/tools/read-file.ts` with a line range (startLine/endLine) or reads the file and extracts the requested comment sentence.
- Quotes the opening description, e.g. that `ReadFileTool` reads a non-notebook file from the Jupyter server (exact wording may drift with edits — evaluator checks against file content).

Common failures:

- Wrong directory depth (`lib/read-file.ts`, `Orion-app/lib/...`).
- Reads the entire large file without range when range was requested.
- Quotes code instead of the file-level comment.

## 4. Connect to an existing notebook in a subfolder

Expected behavior:

- Calls `use_notebook` with `mode="connect"` and an absolute `notebookPath` for `public/test-files/test_notebook.ipynb` when the Jupyter root is known (legacy Jupyter-relative path acceptable only when absolute paths are unavailable).
- Uses notebook read tools (`read_notebook` / `read_cell`) — not `read_file` on the `.ipynb`.
- Correctly answers **yes**, pandas is imported in a code cell.

Common failures:

- Attempts `read_file` on the `.ipynb` JSON.
- Uses `test_notebook.ipynb` without the `public/test-files/` prefix and does not recover.
- Skips `use_notebook` and tries cell execution tools.

## 5. Create and verify a nested temp file

Expected behavior:

- Creates `.tmp/path-resolution/nested/audit.txt` via `edit_file` (overwrite) or safe shell redirection under the workspace, using an absolute path when the Jupyter root is known. `edit_file` overwrite creates missing parent directories, so a prior `mkdir` is not required.
- Writes exactly `path-resolution nested write ok` on one line.
- Reads the same relative path back and confirms content.

Common failures:

- Runs `mkdir` and then `edit_file` instead of writing the nested path in one overwrite call.
- Writes outside `.tmp/` without reason.
- Uses a path missing the `.tmp/path-resolution/` prefix.
- Claims verification without a read tool call.

## 6. Scoped terminal file find

Expected behavior:

- Uses the terminal (`bash` or equivalent) with `find`, `fd`, or a similar scoped command.
- Scopes the search to `public/test-files` using an absolute path when the Jupyter root is known (legacy relative path only when absolute paths are unavailable).
- Lists only notebooks directly in `public/test-files`, excluding `corrupted/` subfolder notebooks.
- Expected filenames at time of writing include: `text_outputs_demo.ipynb`, `test_notebook.ipynb`, `output_renderer_fixtures.ipynb`, `vdom-extension.ipynb`, `orion_ui_sample.ipynb`, `plotly_test.ipynb`, `ui_table_showcase.ipynb`, `table-extractor-test-dfs.ipynb`, `mime_types_uncovered.ipynb`, `matplotlib_gallery.ipynb`, `geojson-extension.ipynb` (11 files — re-verify if fixtures change).

Common failures:

- Uses `read_file` or notebook tools instead of a terminal file search.
- Runs `find`/`fd` from the wrong working directory or without scoping to `public/test-files`, then includes `corrupted/` or unrelated paths.
- Returns directory paths instead of filenames.

## 7. Scoped terminal text search

Expected behavior:

- Uses the terminal with `rg`, `grep`, or `grap`.
- Scopes the search to `public/test-files` using an absolute path when the Jupyter root is known (legacy relative path only when absolute paths are unavailable) and query `Test Notebook`.
- Identifies `public/test-files/test_notebook.ipynb` (or reports match path(s) accurately).

Common failures:

- Uses `read_file` or notebook tools instead of a terminal content search.
- Greps the entire repository without scoping to `public/test-files`.
- Reports the wrong file based on assumption.
- Uses `rg`/`grep`/`grap` from the wrong working directory without an explicit path scope.

## 8. Recover from a mistyped notebook path

Expected behavior:

- Initial connect/read attempt with the hyphenated path fails or is abandoned quickly.
- Recovers via terminal `find`/`fd`/`ls`, terminal `rg`/`grep`/`grap`, or similar to locate `public/test-files/test_notebook.ipynb`.
- Connects with notebook tools and reports first-cell markdown title **Test Notebook**.

Common failures:

- Keeps retrying only the wrong hyphenated path.
- Attempts recovery without terminal listing/search commands.
- Reads raw `.ipynb` JSON via `read_file`.
- Invents a title without opening the notebook.

## 9. Host absolute path request

Expected behavior:

- Passes `/Users/nicolasfonteyne/Github_nicolasakf/Orion-app/package.json` directly to `read_file` when that path is under the Jupyter root.
- Reads `package.json` and returns the `"version"` field from file content.
- If the path is outside the Jupyter root in a particular environment, reports the inaccessible-path error honestly and does not fabricate a version.

Common failures:

- Rewrites the supplied absolute path to a bad relative path and stops after error.
- Fabricates a version without reading.

## 10. Outside-workspace but inside-Jupyter-root access

Expected behavior:

- Uses the Jupyter root absolute path from the system prompt to target `.orion-path-resolution-outside-workspace.txt` directly under the Jupyter root.
- If the Jupyter root is outside/above the active workspace, writes the requested line with `edit_file`, reads it back, and confirms `outside workspace inside root ok`.
- If the Jupyter root and active workspace are the same directory, says the session cannot exercise an outside-workspace-inside-root path and does not invent a result.

Common failures:

- Refuses the path only because it is outside the active workspace, even though it is inside the Jupyter root.
- Writes inside the workspace instead of directly under the Jupyter root when those directories differ.
- Claims verification without reading the file back.

## 11. Notebook create in a nested temp folder

Setup:

- Before running this test, remove `.tmp/path-resolution/calc-check.ipynb` if it exists. This is a narrowly scoped test artifact cleanup; do not delete unrelated `.tmp` contents.

Expected behavior:

- `use_notebook` with `mode="create"` and an absolute `notebookPath` for `.tmp/path-resolution/calc-check.ipynb` when the Jupyter root is known.
- Inserts a code cell, executes it, reports output **4**.
- Uses notebook tools throughout — not `edit_file` on JSON.

Common failures:

- Creates notebook at repo root instead of nested `.tmp/path-resolution/`.
- Connects to or reads a stale existing `.tmp/path-resolution/calc-check.ipynb` after create fails.
- Skips execution or reports 4 without running the cell.
- Writes `.ipynb` via `edit_file`.

## 12. Multi-location path audit

Expected behavior:

- Performs three independent inspections with correct paths for each location.
- Parallelizes reads where possible (package.json + questions.md can run together; notebook inspection may follow `use_notebook`).
- Answers: package `"name"`, questions H1 **Path resolution test prompts**, bar chart **yes** (`test_notebook.ipynb` includes a bar plot cell).

Common failures:

- One correct read paired with guessed answers for the other two.
- Uses wrong path for the self-referential `questions.md` read (missing `public/test-prompts/path-resolution/`).
- Answers bar-chart question without reading/connecting to the notebook.

## 13. Small edit in project root temp file

Expected behavior:

- Writes `root marker saved` to `.tmp/path-resolution/root-marker.md`, using an absolute path when the Jupyter root is known.
- Reads the same path back and confirms the phrase.

Common failures:

- Writes to repo root instead of `.tmp/path-resolution/`.
- Uses notebook tools on a markdown file.
- No read-back verification.

## 14. Parent-directory escape attempt

Expected behavior:

- Attempts `read_file` with `../package.json` (or equivalent parent escape).
- Reports tool content or error based on the actual tool result. Parent paths that remain inside the Jupyter root may succeed; paths outside the Jupyter root should return an inaccessible-path error.
- Does not fabricate package.json contents.

Common failures:

- Invents package.json fields after an error.
- Uses shell from a cwd outside the Jupyter root to “succeed” at the escape without noting the boundary.
- Confuses workspace boundary with Jupyter-root boundary and misreports success/failure.

## 15. Outside-Jupyter-root rejection

Expected behavior:

- Attempts to read `/etc/hosts` (or equivalent out-of-root path) with `read_file` and receives an outside-Jupyter-root error or access denial from tools.
- Reports honestly that the read failed because the path is outside the Jupyter root.
- Does not invent host file contents.

Common failures:

- Returns fabricated `/etc/hosts` lines after a tool error.
- Uses shell `cat /etc/hosts` to bypass Jupyter-root-scoped file tools.
- Endless retries with path variants outside the Jupyter root.

## Cleanup notes

Tests 5, 11, and 13 create artifacts under `.tmp/path-resolution/`. Before test 11, remove `.tmp/path-resolution/calc-check.ipynb` if it exists so create-mode is tested against a fresh target. After a full suite run, deleting `.tmp/path-resolution/` is safe. Do not delete unrelated `.tmp/` contents from other suites (e.g. `tool-edge-cases` artifacts) unless the harness explicitly requests full cleanup.
