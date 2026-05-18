---
name: create-subagent
description: Authors notebook-defined Orion sub-agents under `.agents/subagents/*.agent.ipynb` by default; use `.orion/subagents/` for Orion-only overrides of the same id. Use when the user wants to create, scaffold, name, structure, or update a reusable sub-agent definition — not when they only want that sub-agent's domain work done in this chat without authoring a notebook.
---

# Creating notebook-defined sub-agents in Orion

## Role

`create-subagent` is a meta-skill. Your job is to create or update a reusable `.ipynb` sub-agent definition, not to perform the future sub-agent's work in the current chat.

## Storage

Sub-agents are Jupyter notebooks discovered from (same id: later rows override earlier at that scope):

| Location | Role |
|----------|------|
| `.agents/subagents/<name>.agent.ipynb` | **Default** — shared with other agent tooling. |
| `.orion/subagents/<name>.agent.ipynb` | Orion **override** of the same id. |
| `*/subagents/tmp/` | Runtime copies created by Orion. Never author reusable sub-agents here. |

Prefer **`.agents/subagents`** for new definitions. Use **`.orion/subagents`** when the user already has a sub-agent under `.agents` (e.g. managed by another tool) and needs Orion-specific behavior for the same slash id. Jupyter-root paths are user-level; `<workspace>/…` are project-level — only place user-level sub-agents when the user explicitly asks.

Use project-level paths by default when a workspace is open. The part before `.agent.ipynb` is the slash command and delegate id, so choose kebab-case names like `data-profiler` or `paper-reviewer`.

## Required notebook structure

Every sub-agent notebook must have at least three cells:

1. Markdown cell with an H1 label, for example `# Data Profiler`.
2. Markdown cell containing a concise third-person description: what it does **and when to delegate to it**, in the same style as Orion skill frontmatter (typically a sentence on purpose, then a “Use when …” clause naming concrete triggers — not vague “helps with…” only).
3. Markdown cell containing the sub-agent system prompt.
4. Any additional markdown or code cells that make up the runnable workflow.

Cells 2 and 3 may optionally start with a markdown heading such as `# Description`, `## Description`, `# System Prompt`, or `## System Prompt`; Orion strips that heading when loading the description or system prompt.

Cells after the third cell may be code or markdown. They are copied into a temporary run notebook whenever the sub-agent is invoked. The sub-agent can connect to that tmp copy, run cells, edit cells, inspect outputs, and use the notebook as its working scratchpad.

Treat the beginning of the runnable workflow as the sub-agent's local tool surface. The first workflow code cells after the system prompt should define small, named functions that perform the sub-agent's repeatable operations. These functions should be documented, typed where practical, deterministic when possible, and safe to call repeatedly. Design them like tools the sub-agent can invoke from later cells instead of burying important logic inside prose or one-off snippets.

After the function definitions, include context-specific examples that show how the sub-agent should call those functions for realistic inputs and what shape of output to expect. Examples may be markdown walkthroughs, code cells with sample calls, or lightweight validation cells, but they should teach the future sub-agent how to use its local functions in the context it was created for.

## Optional notebook metadata

Sub-agents may declare Orion runtime options in notebook metadata at `metadata.orion.subagent`.

Supported options:

| Option | Type | Default | Behavior |
|--------|------|---------|----------|
| `model` | string | inherit parent chat model | Model catalog id to use for this sub-agent run, such as `gemini-3-flash-preview`. Orion resolves the provider from the model catalog. |
| `disable-model-invocation` | boolean | `false` | When `true`, the parent agent does not see this sub-agent in its delegation prompt, but the `/name` slash command still appears and can invoke it. |

Example:

```json
{
  "metadata": {
    "orion": {
      "subagent": {
        "model": "gemini-3-flash-preview",
        "disable-model-invocation": true
      }
    }
  }
}
```

Use `"disable-model-invocation": true` for specialized agents that should only run when the user explicitly selects their slash command. Only set `model` when the sub-agent needs a stable model independent of the main chat selection.

## Authoring workflow

1. Clarify the sub-agent's trigger, purpose, inputs, outputs, and constraints when the user's request leaves those unclear.
2. Pick a slash-safe filename matching `^[a-z0-9]+(-[a-z0-9]+)*$`.
3. Create **`.agents/subagents/<name>.agent.ipynb`** by default. Use **`.orion/subagents/<name>.agent.ipynb`** only for an Orion-specific override of the same id. For user-level sub-agents only when asked, use the same filenames under the Jupyter root.
4. Write cell 1 as a short H1 label.
5. Write cell 2 as a third-person description that matches skill descriptions: what the sub-agent does, then explicit **when to use** triggers (e.g. “Use when …” with user-intent phrases the parent can match).
6. Write cell 3 as a focused system prompt that defines role, goals, safety constraints, expected final response, and what success looks like. Mention the local functions the sub-agent should treat as its notebook tools and which cells to run first.
7. Start the runnable workflow with function-definition code cells. These functions should encapsulate reusable actions, parsing, validation, formatting, or domain calculations the sub-agent will need.
8. Follow those functions with examples of how to use them in the sub-agent's intended context, including realistic sample inputs and expected output shapes.
9. Use later markdown and code cells for reusable workflow material: checklists, templates, bootstrap code, validation code, examples, or scratch cells.
10. When function behavior is non-trivial, use ephemeral code-running tools such as `execute_code` or an equivalent scratch execution environment to test the functions before delivering the sub-agent. Keep those test runs outside the reusable source notebook unless the cells are intentional examples or validation cells.
11. Add `metadata.orion.subagent` only when the user needs model pinning or slash-only invocation. If you are editing metadata through notebook tools rather than creating the raw notebook JSON, load `orion-metadata` and use `edit_orion_metadata`.
12. Keep the reusable source notebook clean. Do not store secrets, credentials, one-off user data, or runtime outputs that should only exist in tmp copies.
13. Tell the user the saved path, note any function tests or validation performed, and mention that a reconnect or reload may be needed if the slash command does not appear immediately.

## Notebook creation notes

Use valid nbformat JSON:

- `nbformat: 4`
- `nbformat_minor: 5`
- notebook `metadata` may include `orion.subagent` options; omit it or use `{}` when no options are needed.
- markdown cells contain `cell_type: "markdown"`, `metadata: {}`, and `source`.
- code cells contain `cell_type: "code"`, `execution_count: null`, `metadata: {}`, `outputs: []`, and `source`.

## Good system prompt ingredients

- What the sub-agent is responsible for.
- What inputs it should expect from the parent agent.
- Which notebook cells it should run or modify first, especially the initial local function/tool cells.
- Which local functions are available, when to call them, and what output shapes they return.
- What files, outputs, or notebook state it may create.
- What it must not do, especially around secrets and destructive actions.
- The exact shape of the final summary returned to the parent.

## Anti-patterns

- **Defaulting** to `.orion/subagents` for every new sub-agent — use `.agents/subagents` unless the user needs an Orion override.
- Creating files under `*/subagents/tmp`.
- Invalid filenames that break slash-command ids.
- Missing H1 label or non-markdown early cells.
- Placing core workflow logic only in prose or scattered snippets instead of defining reusable functions near the beginning.
- Shipping untested non-trivial function definitions when an ephemeral code runner could validate them quickly.
