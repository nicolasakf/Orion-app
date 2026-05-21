---
name: create-github-issues
description: Creates GitHub issues for the Orion repo following project conventions. Use when the user asks to create an issue, file a bug, add a feature request, or track work in GitHub issues.
---

# Creating GitHub Issues for Orion

## Quick Start

When creating issues for the Orion-app repo (https://github.com/nicolasakf/Orion-app):

1. Use the body template below
2. Add exactly 2 labels: one type (bug, new-feature, refactor) and one status (backlog, not-started, in-progress)
3. Create via `gh issue create` or output markdown for manual creation

## Body Template

```markdown
# [Title - same as issue title]

Status: [Backlog | Not started | In progress]
Component: [Component name - optional]
Feature: [Feature name - optional]
Child Component: [Child component - optional]
Type: [New Feature | Bug Fix | refactor]

[Description: bullets or paragraph]

---

- **Component**: [Name]
- **Child Component**: [Name - if applicable]
- **Feature**: [Name - if applicable]
```

## Labels

Every issue has **exactly 2 labels**: one type label and one status label.

**Type labels** (pick one):
| Label | Use when |
|-------|----------|
| `bug` | Something isn't working |
| `new-feature` | New feature or request |
| `refactor` | Code refactoring |
| `optimization` | Performance optimization |

**Status labels** (pick one):
| Label | Use when |
|-------|----------|
| `backlog` | Planned for future |
| `not-started` | Work has not started |
| `in-progress` | Work is in progress |

**Examples:** `bug` + `not-started`, `new-feature` + `backlog`, `refactor` + `in-progress`

## Title Guidelines

- Short, descriptive, PascalCase or sentence case
- Examples: "StatusBar initial Implementation", "Sizing the tabs lagging", "File Node Actions"

## Creating via CLI

```bash
gh issue create --repo nicolasakf/Orion-app --title "Title" --body "$BODY" --label "label1" --label "label2"
```

Or with a body file:

```bash
gh issue create --repo nicolasakf/Orion-app --title "Title" --body-file issue-body.md --label "new-feature" --label "not-started"
```

## Examples

See [examples.md](examples.md) for real issue bodies from the repo.
