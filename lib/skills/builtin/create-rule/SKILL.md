---
name: create-rule
description: Authors AGENTS.md or CLAUDE.md workspace rule files that Orion injects into every chat. Use when the user wants to create, update, or scaffold project conventions, coding standards, AGENTS.md, CLAUDE.md, or persistent agent instructions — not when they only want the domain work done without authoring a rule file.
disable-model-invocation: false
---

# Creating workspace rules in Orion

## Full documentation

For extended user guides, examples, and troubleshooting beyond this skill file, read:
https://docs.orion-agent.ai/ai-assistant/builtin-skills/create-rule.html

## Critical — you are the rule author, not the rule in disguise

`create-rule` is a **meta-skill**: your job in this turn is to **create or update** `AGENTS.md` or `CLAUDE.md` on the Jupyter workspace. The user's message is almost always a **specification** for the *new* rule (what the assistant should always follow in this workspace), **not** a request for you to perform that domain work in this chat.

| Wrong | Right |
|-------|--------|
| The user describes coding standards and you **apply them to the current task** without writing a file. | You treat that text as the **content** to encode: choose scope, pick `AGENTS.md` vs `CLAUDE.md`, write the file, then tell them where it was saved. |
| You output the deliverable the rule would govern (a refactored module, a formatted report) when they asked to "add a rule for …". | You output the **rule file** and a short summary; the deliverable of *this* turn is the **rule document**, not the end-user artifact. |

**Exception:** If the user only asks about format, storage paths, or how rules differ from skills—with **no** new rule to author—answer helpfully and **do not** invent a file unless they confirm they want it.

## How Orion loads rules

Orion discovers **at most two** rule files and injects them into **every** chat in the active workspace (Agent, Ask, and Edit modes, including sub-agents):

| Scope | Path | When loaded |
|-------|------|-------------|
| **Global** | `<jupyter-server-root>/AGENTS.md` or `CLAUDE.md` | When a workspace root is open; applies across projects on that server |
| **Workspace** | `<workspace-root>/AGENTS.md` or `CLAUDE.md` | Applies to the current project folder |

At each scope, Orion prefers **`AGENTS.md`** and falls back to **`CLAUDE.md`** only when `AGENTS.md` is missing or empty. Use **`AGENTS.md` by default** — it is the cross-tool standard (Codex, Cursor, Claude Code, and Orion).

Rules are **always on** (unlike skills, which load on demand). Keep them focused on durable project conventions, not one-off task instructions.

### Limits

- **40,000 characters** per rule file — Orion skips files that exceed this limit.
- **Empty files** are ignored.
- Only the two scopes above are loaded; nested paths such as `src/AGENTS.md` are **not** discovered.

## Rules vs skills

| | Rules (`AGENTS.md` / `CLAUDE.md`) | Skills (`SKILL.md`) |
| --- | --- | --- |
| Loading | Automatic in every chat | On demand via `/name` or model choice |
| Scope | One file per global/workspace scope | Many skills per workspace |
| Best for | Always-on coding standards, safety policies, repo conventions | Repeatable workflows, checklists, domain playbooks |
| Location | Workspace or server root | `.agents/skills/<name>/` or `.orion/skills/<name>/` |

When the user needs a **workflow** they invoke occasionally, suggest **create-skill** instead. When they need **always-on guidance**, use this skill.

## File format

Rule files are plain markdown — **no YAML frontmatter**. Write clear, actionable instructions the assistant should follow in this workspace.

### Minimal example (`AGENTS.md`)

```markdown
# Project conventions

## TypeScript
- Use strict typing; avoid `any` unless necessary.
- Group imports: React, components, utils, types — blank line between groups.

## Testing
- Prefer vitest for unit tests colocated as `*.vitest.test.ts`.
```

### Good rule content

- **Concise** — Aim for under ~200 lines; split long reference material into linked docs in the repo.
- **One concern per section** — Use headings so the model can scan quickly.
- **Actionable** — Prefer "Do X" / "Avoid Y" over vague principles.
- **Concrete examples** — Show good vs bad patterns when it clarifies expectations.

## Implementation workflow (for the agent)

1. **Clarify scope** — Should the rule apply to the **current workspace only** (`<workspace-root>/AGENTS.md`) or **globally** on this Jupyter server (`<jupyter-server-root>/AGENTS.md`)? Default to **workspace** unless the user asks for server-wide rules.
2. **Choose filename** — Prefer **`AGENTS.md`**. Use **`CLAUDE.md`** only when the user explicitly wants Claude Code compatibility and `AGENTS.md` already exists with different content they do not want to merge.
3. **Check existing file** — Read the target path first. **Merge or update** thoughtfully when a file already exists; do not blindly overwrite team conventions unless the user asked to replace them.
4. **Draft content** — If the user pasted a full spec, encode it into the rule file. Trim redundancy with existing repo docs (README, CONTRIBUTING) when the user wants a pointer instead of duplication.
5. **Write the file** — Use `edit_file` (overwrite) on the Jupyter server. Create parent directories as needed.
6. **Remind** — Rules reload when Orion detects the file change. If the new rule does not appear in the next message, reload the app or reconnect the kernel.

## Anti-patterns

- Stuffing one-off task instructions into `AGENTS.md` — use a skill or a normal chat message instead.
- Creating both `AGENTS.md` and `CLAUDE.md` at the same scope with duplicate content — pick one primary file.
- Huge pasted blobs — link to existing docs or split into a skill with progressive disclosure.
- Placing rules in `.cursor/rules/` or other tool-specific paths — Orion only loads root-level `AGENTS.md` / `CLAUDE.md`.

## Quick checklist

- [ ] Target path is `<workspace-root>/AGENTS.md` (default) or the user-requested global/server path
- [ ] `AGENTS.md` preferred over `CLAUDE.md` unless user specified otherwise
- [ ] Existing file read and merged when appropriate
- [ ] Content is under 40,000 characters
- [ ] User knows rules apply automatically on the next chat (reload if needed)
