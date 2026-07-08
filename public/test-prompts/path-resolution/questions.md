# Path resolution test prompts

Use these prompts as the **questions** for manual or automated agent-tool tests. This file intentionally contains only user-facing prompts. Do not include expected tool calls, scoring notes, or answers here; keep those in `answers.md`.

Assume the Orion project is open as the active workspace unless a prompt says otherwise. Use the absolute Jupyter root and workspace paths from the agent system prompt for path-like tool inputs. Files under the Jupyter root are accessible even when they are outside the active workspace; files outside the Jupyter root are not.

Before running test 11, or before running this full suite, remove the stale test artifact `.tmp/path-resolution/calc-check.ipynb` if it exists. Do not delete unrelated `.tmp` contents.

## 1. Root-level file read

Read `package.json` in the project root and tell me the value of the `"name"` field.

## 2. Nested subfolder file read

Read `public/test-prompts/tool-edge-cases/questions.md` and tell me how many numbered test sections it contains (count the `## N.` headings).

## 3. Deep path with line range

Read lines 1–15 of `lib/agent/tools/read-file.ts` and quote the first sentence of the file-level comment block (the description under the opening `/**`).

## 4. Connect to an existing notebook in a subfolder

Connect to the existing notebook at `public/test-files/test_notebook.ipynb`, read its cells, and tell me whether any code cell imports `pandas`.

## 5. Create and verify a nested temp file

Create the file `.tmp/path-resolution/nested/audit.txt` containing exactly this single line:

`path-resolution nested write ok`

Then read the file back and confirm the line is present.

## 6. Scoped terminal file find

Using the terminal, find every `.ipynb` file directly in `public/test-files` (not in subfolders). Use `find`, `fd`, or an equivalent shell command. Report the filenames only.

## 7. Scoped terminal text search

Using the terminal, search for the phrase `Test Notebook` under `public/test-files` with `rg`, `grep`, or `grap`. Report which file(s) contain it.

## 8. Recover from a mistyped notebook path

A colleague said the smoke-test notebook lives at `public/test-files/test-notebook.ipynb` (with a hyphen). Open that notebook, read it, and report the markdown title from the first cell. If the path does not work, find the correct notebook in that folder and continue.

## 9. Host absolute path request

Read the project root `package.json` for me. I only have this absolute path from Finder:

`/Users/nicolasfonteyne/Github_nicolasakf/Orion-app/package.json`

Use whatever path form Orion needs and return the `"version"` field.

## 10. Outside-workspace but inside-Jupyter-root access

Using the Jupyter root absolute path from the system prompt, create a temp text file directly under the Jupyter root named `.orion-path-resolution-outside-workspace.txt` containing exactly:

`outside workspace inside root ok`

Then read it back and confirm whether it worked. If the Jupyter root and active workspace are the same directory, say this session cannot exercise an outside-workspace-inside-root path and do not invent a result.

## 11. Notebook create in a nested temp folder

Create a new notebook at `.tmp/path-resolution/calc-check.ipynb`. Add one code cell that computes `2 + 2`, run it, and report the output value.

## 12. Multi-location path audit

In one response, gather all of the following:

1. The `"name"` field from root `package.json`
2. The H1 title at the top of `public/test-prompts/path-resolution/questions.md`
3. Whether `public/test-files/test_notebook.ipynb` contains a bar chart cell (yes/no is enough)

Do independent reads/inspections in parallel when you can.

## 13. Small edit in project root temp file

Create or update `.tmp/path-resolution/root-marker.md` so it contains the phrase `root marker saved`, then read it back to verify.

## 14. Parent-directory escape attempt

Try to read `../package.json` (one directory above the workspace root). Report whether Orion returned content or an error, without fabricating file contents.

## 15. Outside-Jupyter-root rejection

Try to read the host file `/etc/hosts` through Orion's file tools. Tell me whether it worked; if not, explain what happened and do not keep retrying with unrelated guesses.
