---
name: create-user-facing-docs
description: Writes or updates end-user help in Orion-docs with clear fix-first steps, plain language, and issue links when relevant; includes POSIX and Windows (NT) paths or commands when both apply. Use when the user asks for user-facing documentation, public help pages, troubleshooting guides for Orion users, or markdown under Orion-docs.
---

# User-facing documentation (Orion-docs)

## Scope and location

- **Default path**: `Orion-docs/docs/` in the monorepo (published at [docs.orion-agent.ai](https://docs.orion-agent.ai)). Write for **end users**, not engineers maintaining the repo.
- **Getting started** articles: `Orion-docs/docs/getting-started/`
- **Troubleshooting / how-tos**: `Orion-docs/docs/troubleshooting/`
- **Do not** put user-facing articles in `Orion-app/docs/` unless the user explicitly asks—that folder is internal/developer-oriented.
- After adding or renaming a page, register it in `Orion-docs/docs/.vitepress/config.ts` sidebar.

## Before writing

1. **Read one existing file** in `Orion-docs/docs/troubleshooting/` (for example `chatgpt-codex-device-authorization.md`) and **match** heading style, tone, and density.
2. **Clarify the outcome**: What should the user be able to do after reading? Prefer **numbered steps** for procedures (especially fixes).
3. If the doc addresses a **GitHub issue**, fetch or confirm title/body with `gh issue view <n>` and link the issue at the end; keep the article useful even if someone lands without issue context.

## Voice and style

- **Plain language**, complete sentences, minimal jargon. Explain product-specific terms once if needed.
- **Fix-first** when the topic is troubleshooting: state the fix or main steps early; background comes after.
- **No engagement filler** or vague “you may want to consider” padding—be direct.
- Avoid **§** and other characters that render poorly in product UIs (per project conventions).
- Use **bold** sparingly for real emphasis only.

## Structure (recommended)

Use this shape unless the topic clearly needs something else:

1. **Title** — user problem or outcome (H1).
2. **Lead** — one short paragraph: who this is for and what problem it solves.
3. **When you need this** (optional) — bullets for symptoms or triggers.
4. **Steps** — ordered list for configuration, account settings, or CLI; full commands in fenced blocks; opening fence on its own line.
5. **Notes** (optional) — edge cases, version/UI label drift, security caveats.
6. **Related** (optional) — link to GitHub issue or official external docs with full URLs.
7. **Footer** (optional) — italic line with “Last updated” month/year.

## Technical content

- **External links to docs.orion-agent.ai** (from Orion-app, Orion-website, skills, or README files) must include the **`.html`** suffix — for example `https://docs.orion-agent.ai/getting-started/install.html`. Static hosting does not rewrite clean paths. In TypeScript, use `orionUserDocsPage()` from `lib/constants/user-docs.ts` (Orion-app) or `orionDocsPage()` from `lib/orion-install.ts` (Orion-website). Relative links like `/getting-started/install` are fine **inside** Orion-docs markdown (VitePress client routing).
- Prefer **exact settings** (config keys, file names, menu paths) verified against current upstream docs when possible.
- **POSIX and Windows (NT)** — whenever instructions depend on **filesystem paths**, **shell**, or **OS-specific commands**, give both:
  - **POSIX** (macOS/Linux): e.g. `~/.jupyter/`, forward slashes, `$HOME` in shell examples when useful.
  - **Windows** (NT): e.g. `%USERPROFILE%\.jupyter\` or `C:\Users\<username>\.jupyter\`, and PowerShell (`$env:USERPROFILE`) or cmd syntax when the step differs from POSIX (skip duplication when identical).
- Use clear subheadings or a two-column bullet pair (**macOS / Linux** vs **Windows**) so users can scan; do not assume everyone is on POSIX.
- If only one OS is in scope (e.g. Apple-only UI), say so once and skip the other.
- For CLI: show the **minimal** command per OS when they differ; note when a restart or reload is required.

## File naming

- **kebab-case** `.md`, descriptive: `jupyter-hidden-folders-and-skills.md`, not `issue-182.md` unless the user wants issue-numbered names.

## What to avoid

- Internal runbooks, migration SQL, or secrets—those belong elsewhere.
- Drive-by edits to unrelated docs or `components/ui/` (shadcn).
- Duplicating long engineering discussion from issues; **summarize** and link.

## Checklist before finishing

- [ ] Lives under `Orion-docs/docs/` and is listed in `.vitepress/config.ts` unless specified otherwise.
- [ ] User can follow steps without reading the issue or source code.
- [ ] Commands and config snippets are copy-paste complete.
- [ ] Where paths or shell commands differ by OS: **POSIX and Windows (NT)** instructions are both present, or the doc states a single-OS scope.
- [ ] Links use full `https://` GitHub or doc URLs.
