# Agent API

## Chat Request

`POST /api/chat` expects:

- `messages`
- `provider`
- `model`
- optional agent context such as active notebook path, workspace directory, available skills, and available sub-agents

Provider credentials are resolved server-side from `~/.orion/credentials.json` using the requested `provider` and `model`. Chat, compaction, title-generation, and sub-agent requests must not include API keys or OAuth tokens.

## Model Validation

Models are validated against `lib/agent/model-catalog.ts`. To add a model, update the catalog entry with:

- `provider_id`
- `model_id`
- `label`
- context window
- default pin state if desired
- pricing metadata if known

## Tool Schemas

Tool schemas are defined in `lib/agent/tool-schemas.ts`. They describe what the model may request; execution handlers live in the client runtime.

Avoid optional/nullable schema fields for model-facing tool input. Prefer required strings with `""` as the sentinel for “use default” where needed, because some providers have stricter schema support.

## Adding A Tool

1. Add the schema in `lib/agent/tool-schemas.ts`.
2. Add or update the concrete implementation under `lib/agent/tools/`.
3. Dispatch it through `AssistantProvider`.
4. Add UI metadata in `components/right-sidebar/tool-invocation-helpers.ts`.
5. Cover pure behavior with tests when possible.

## Skills

Skills are markdown files with YAML frontmatter. A typical skill:

```markdown
---
name: data-profiler
description: Profiles tabular data and summarizes quality issues.
---

Inspect the active dataset, identify schema, missingness, distributions, and surprising values.
```

Slash commands are generated for discoverable skills.

## Sub-Agents

Sub-agents are `.agent.ipynb` files. The first three cells are required:

1. Markdown H1 name
2. Markdown description
3. Markdown system prompt

Sub-agents can optionally declare a model in Orion metadata. If omitted, they inherit the parent chat model.

## ChatGPT OAuth

The ChatGPT OAuth device flow is available without app login. The start and poll routes operate on local credentials; successful polling persists tokens directly to `~/.orion/credentials.json` and returns only a sanitized configured-state summary to the browser.
