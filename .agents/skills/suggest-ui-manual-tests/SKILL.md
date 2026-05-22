---
name: suggest-ui-manual-tests
description: Reviews code changes from a refactor or UI work and produces a prioritized manual UI test checklist. Use after large refactors, component extractions, editor or layout changes, or when the user asks for manual tests, UI QA, or a test plan before shipping.
disable-model-invocation: true
---

# Suggest UI Manual Tests

Use this skill when a refactor or UI change is large enough that automated tests alone are not enough confidence. The goal is a **short, high-value manual test plan** the user can run in the browser — not an exhaustive QA matrix.

## Workflow

1. **Establish scope**
   - Identify what changed: uncommitted work, current branch vs base, or files the user named.
   - Prefer `git diff` against the merge base (`main` or repo default) plus `git status` for untracked files.
   - Read changed UI-related files (components, pages, contexts, hooks, styles) — not every line of backend-only code unless it affects visible behavior.

2. **Summarize the change for the user**
   - One short paragraph: what moved, what stayed the same, and which user-visible surfaces are touched.
   - Call out **behavioral contracts** that must not regress (save, navigation, keyboard shortcuts, modals, loading/error states).

3. **Map changes to UI surfaces**
   - Group by route, panel, modal, or feature area (e.g. editor, sidebar, chat, settings).
   - Note **new code paths** (new components, registries, context providers) — these are higher risk than renamed files with identical behavior.

4. **Prioritize tests**
   - Include only tests that catch real regressions or validate the refactor’s intent.
   - Prefer **smoke + critical paths + one edge case per risky area** over long exhaustive lists.
   - Skip trivial checks (e.g. “page loads”) unless loading itself was changed.

5. **Deliver the test plan**
   - Use the output template below.
   - Each test: concrete steps, expected result, and why it matters (tie to a specific change).
   - Order by priority: **P0** (must pass before merge) then **P1** (should pass) then **P2** (nice to verify).

Do **not** run `npm run dev`, `npm run build`, or `npm run start` unless the user asked. This skill produces a plan for **them** to execute in the UI.

## What counts as high value

| High value | Usually skip |
|------------|--------------|
| Primary user flows through changed code | Pixel-perfect spacing on unrelated screens |
| Data round-trip (edit → save → reload → still correct) | Every permutation of optional settings |
| Navigation into/out of refactored views | Re-testing unrelated features |
| Keyboard / accessibility paths if handlers moved | Duplicate tests that differ only by label |
| Error, empty, and loading states if logic moved | Low-risk copy-only changes |
| Cross-feature interactions (e.g. editor + chat + file tree) | Tests with no link to the diff |

## Change review checklist

Use this while reading the diff:

- [ ] Which routes or entry points render changed components?
- [ ] Did props, context, or hooks change shape? (breakage often shows up as silent empty UI)
- [ ] Were conditional branches added, removed, or reordered?
- [ ] Do effects, subscriptions, or debouncers still run on the right triggers?
- [ ] Are feature flags, permissions, or view modes still respected?
- [ ] Did file-type or MIME routing change (editors, previews, toolbars)?
- [ ] Mobile vs desktop layout — only if layout/CSS changed meaningfully

## Output template

```markdown
## Change summary

[2–4 sentences: scope, main surfaces, and main risk.]

## Manual UI test plan

### P0 — Must verify

- [ ] **[Area] — [Short title]**
  - **Why:** [Which change this guards]
  - **Steps:** 1. … 2. … 3. …
  - **Expected:** …

### P1 — Should verify

- [ ] …

### P2 — If time allows

- [ ] …

## Not worth testing manually

[Bullet list of areas intentionally omitted and why — e.g. backend-only, unchanged UI path.]

## Gaps / follow-ups

[Optional: missing automated coverage, areas that need a second device/browser, or questions for the user.]
```

Keep P0 to roughly **3–8** items unless the refactor truly touches that many independent surfaces.

## Tips

- Reference specific files or features from the diff when explaining **Why**, not when writing **Steps** (steps should read like instructions for a human tester).
- If the refactor is incremental, say which tests apply to **this slice** vs a later follow-up.
- When unsure whether behavior changed, say so and suggest one targeted test to confirm intent with the user.
