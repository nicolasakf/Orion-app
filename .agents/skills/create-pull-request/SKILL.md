---
name: create-pull-request
description: Opens a GitHub pull request using the gh CLI with a clear title and body, optional issue links, and draft or ready state. Use when the user asks to open a PR, create a pull request, submit changes for review, or publish a branch to GitHub.
---

# Create Pull Request (Orion)

## Prerequisites

- `gh` installed and authenticated (`gh auth status`)
- Current branch pushed to `origin` (or push as part of the workflow)
- Remote `origin` points at the GitHub repo (for Orion: `nicolasakf/Orion`)

## Workflow

1. **Confirm branch and scope**
   - Note the current branch: `git branch --show-current`
   - If the user has uncommitted changes they want included, commit first (only when they ask to commit)
   - Summarize what the PR changes from `git diff` / `git log` against the merge base

2. **Push the branch**

   ```bash
   git push -u origin HEAD
   ```

   Use `--force-with-lease` only when the user explicitly wants to rewrite remote history.

3. **Avoid duplicate PRs**

   ```bash
   gh pr list --head "$(git branch --show-current)" --json number,url
   ```

   If a PR already exists for this branch, share the URL and offer to update title/body with `gh pr edit` instead of creating another.

4. **Choose base branch**

   - Default: `main` (or the repo default: `gh repo view --json defaultBranchRef -q .defaultBranchRef.name`)
   - Use another base only if the user specified it or the work clearly targets a long-lived branch

5. **Create the PR**

   Prefer a body file for multi-line descriptions:

   ```bash
   gh pr create --base main --title "Short imperative title" --body-file pr-body.md
   ```

   For a quick one-liner body:

   ```bash
   gh pr create --base main --title "Short imperative title" --body "One or two complete sentences on what changed and why."
   ```

   **Draft:** add `--draft` when the user wants review later or CI must run first.

   **Issue linkage:** in the body, use `Fixes #123`, `Closes #123`, or `Related to #123` as appropriate.

## Title and Body Standards

- **Title:** Imperative mood, scoped if helpful (e.g. `chat: migrate sidebar to AI SDK v6 UIMessage`). Roughly 50–72 characters when possible.
- **Body:** Complete sentences. Include:
  - What changed (user-visible or architectural)
  - Why (problem solved, context, or linked issue)
  - How to verify (manual steps or tests run), if non-obvious
- Match team tone: precise, no filler; avoid vague phrases like "misc fixes" without detail.

## Body Template

```markdown
## Summary

[2–4 sentences: what this PR does and why.]

## Test plan

- [ ] [Step or command]
- [ ] [Step or command]

Fixes #NNN
```

Omit **Test plan** if the user says testing is not needed; keep **Summary** unless they only want a minimal PR.

## Useful Commands

| Command | Purpose |
|--------|---------|
| `gh pr create` | Open a new PR (interactive if flags omitted) |
| `gh pr view --web` | Open current branch PR in browser |
| `gh pr edit <n> --title "..." --body-file file.md` | Update title/body |
| `gh pr ready` | Mark draft PR ready for review |

## Notes

- Do not run `npm run dev`, `npm run build`, or `npm run start` unless the user asked; they may request tests or lint instead per project guidelines.
- If the user is in a git worktree, still use `gh` from that worktree; `gh` uses the repo associated with the current directory.
