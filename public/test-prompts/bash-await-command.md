# Bash and await_command (no blockUntilMs)

Use these prompts to exercise foreground completion, auto-handoff to `await_command`, `background: true`, pattern matching, and PTY state after removing `blockUntilMs` from the tool surface.

> **Environment note (Windows Jupyter terminal):** The Jupyter terminal shell is PowerShell. Prefer PowerShell-safe command chaining over `&&` when compatibility matters, use `curl.exe` instead of `curl` to avoid the `Invoke-WebRequest` prompt, and avoid Unix-only commands like `uname` unless the environment is known to provide them.

## 1. Short foreground (should complete without await_command)

Run `git status` in the project root and tell me what branch I'm on.

**Expected:** Single `bash` call, `status: completed`, no `await_command` follow-up.

## 2. Medium foreground (should still complete in one call under the 60s budget)

Install `cowsay` with pip and then run it with the message 'orion works'.

**Expected:** One `bash` for `pip install cowsay` (finishes in roughly 10–20s), completes in foreground. On Windows/PowerShell, the model may need to avoid `&&` and use the correct `cowsay` CLI invocation such as `python -m cowsay -t 'orion works'`.

## 3. Long foreground, auto-handoff to await_command

Run `python -c "import time; [print(i) or time.sleep(1) for i in range(45)]"` and tell me when it's done.

**Expected:** `bash` returns `status: running` after the foreground wait budget, model follows `next_step` and calls `await_command` (no `blockUntilMs` in args), then reports completion.

## 4. Background: long-running server

Start an HTTP server on port 8765 serving the current directory, then confirm it's live by curling it.

**Expected:** `bash` with `background: true` launches the server, then a separate `bash` with `terminalName: ""` creates a fresh chat terminal and runs a client request. On Windows/PowerShell, prefer `curl.exe` over `curl`.

## 5. Background plus await_command pattern matching

Start a process that prints 'READY' after 10 seconds, then waits forever. Wait until it prints 'READY' and then tell me.

**Expected:** `bash` with `background: true`, then `await_command` with `pattern: "READY"` (no `blockUntilMs`). If the process is intentionally long-lived, pattern matching may occur before command completion.

## 6. Shell state persistence

Make a temp dir inside the project workspace, `cd` into it, set `FOO=bar`, then in a new bash call verify that the working directory and environment variable both reflect those changes.

**Expected:** First `bash` returns a `terminalName`. Second `bash` must reuse that exact `terminalName`; otherwise `terminalName: ""` would create a fresh terminal and lose the shell state. On PowerShell, using `Set-Location` and `$env:FOO='bar'` is acceptable.

## 7. Multiple terminals

Start `tail -F /tmp/orion_test/log.txt` in the background in one chat-scoped terminal, then from another `bash` call append 'hello' to that file and fetch the watcher output to confirm.

**Expected:** First `bash` uses `background: true` and returns a `terminalName` for the watcher. The next `bash` can use `terminalName: ""` to create a separate fresh chat terminal, and `await_command` should reuse the explicit watcher `terminalName`. On Windows/PowerShell, an equivalent file-watching command is acceptable.

## 8. execute_code unchanged

In the current notebook, run a lightweight OS info command via `execute_code` and paste the output.

**Expected:** `execute_code` still works; no confusion with `bash`. Use a command appropriate to the host OS (for example `!uname -a` on Unix-like systems, or `!ver` / `!cmd /c ver` on Windows).

## 9. Prompt compliance (background for long builds)

Run `npm run build` for the whole project.

**Expected:** Model should prefer `background: true` for a full build; foreground plus `await_command` handoff is also acceptable.

## How to read the results

- In the tool-call UI, confirm no `(block … ms)` chip appears for bash or await_command.
- Raw tool args should not include `blockUntilMs`.
- Any "still running" message should reference a built-in budget or time phrase, not `blockUntilMs=…`.

If prompts 3 and 9 behave as described, the model has internalized the new tool surface.
