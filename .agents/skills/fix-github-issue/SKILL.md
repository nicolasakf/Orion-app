---
name: fix-github-issue
description: Fetches GitHub issue descriptions using the gh CLI and implements the fix, feature, optimization, or refactor described. Use when the user asks to fix a GitHub issue, implement an issue, work on an issue by number, or when given an issue URL or number.
---

# Fix GitHub Issue

## Overview

When asked to fix or implement a GitHub issue, fetch the issue details with the gh CLI, then implement the described changes. Works for fixes, new features, optimizations, and refactors.

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth status`)
- Working in a git repository with a GitHub remote

## Workflow

### 1. Fetch the issue

Get the issue by number or URL:

```bash
gh issue view <number> --json title,body,labels,state
```

Or with a full URL:

```bash
gh issue view <owner/repo>#<number> --json title,body,labels,state
```

For human-readable output (useful for quick review):

```bash
gh issue view <number>
```

### 2. Parse and understand

- **Title**: High-level summary of the request
- **Body**: Full description, acceptance criteria, reproduction steps, or spec
- **Labels**: Hint at type (bug, enhancement, refactor) and priority

### 3. Implement

- **Bug fix**: Reproduce if possible, then fix root cause and add/update tests
- **Feature**: Follow the spec in the body; implement incrementally and test
- **Optimization**: Identify the bottleneck, measure if needed, then optimize
- **Refactor**: Preserve behavior; improve structure, naming, or patterns

### 4. Verify

- Run existing tests
- Manually verify the described behavior
- Check for lint/type errors

## Implementation Guidelines

- **Scope**: Implement only what the issue describes; avoid unrelated changes
- **Tests**: Add or update tests for new behavior or bug fixes
- **Documentation**: Update docs when behavior or API changes
- **Commit**: Reference the issue in the commit message (e.g. `fix: resolve #123` or `Closes #123`)

## Common gh Commands

| Command | Purpose |
|---------|---------|
| `gh issue view <n>` | View issue (human-readable) |
| `gh issue view <n> --json title,body,labels` | Get structured JSON |
| `gh issue view <n> -q .body` | Extract body only (requires jq) |
| `gh issue list` | List open issues |
| `gh auth status` | Verify gh is authenticated |

## Example

User: "Fix issue #42"

1. Run: `gh issue view 42 --json title,body,labels`
2. Parse output: e.g. "Bug: Button not disabled when form invalid"
3. Locate the button and form validation logic
4. Implement the fix (disable when invalid)
5. Add/update tests, run lint, verify
