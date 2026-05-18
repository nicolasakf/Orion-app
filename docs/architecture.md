# Architecture

Orion is a standalone AI notebook IDE. All model credentials are configured locally; no account or hosted backend is required.

## Directory Tree

```
orion/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── chat/route.ts         # AI chat endpoint (streaming, BYOK)
│   │   ├── models/route.ts       # Static model catalog endpoint
│   │   └── credentials/          # ChatGPT OAuth device flow routes
│   ├── layout.tsx                # Root layout (providers, theme)
│   └── page.tsx                  # App shell — mounts editor + chat sidebar
│
├── components/
│   ├── notebook/
│   │   ├── notebook-editor.tsx   # Notebook view, cell list, keyboard handling
│   │   ├── notebook-cell.tsx     # Single cell: Monaco, output, toolbar
│   │   ├── output-renderer.tsx   # MIME-type dispatcher for cell outputs
│   │   └── renderers/            # Per-type output renderers (plotly, vega, html, …)
│   ├── right-sidebar/
│   │   ├── right-sidebar.tsx     # Chat orchestration loop + tool dispatch
│   │   ├── chat-textbox.tsx      # Input, model selector, slash commands
│   │   ├── chat-body.tsx         # Message list
│   │   ├── tool-invocation-card.tsx  # In-progress tool call UI
│   │   └── slash-commands.ts     # Built-in and skill/subagent slash commands
│   ├── left-sidebar/
│   │   ├── left-sidebar.tsx      # File tree, workspace picker, variables panel
│   │   └── file-tree.tsx         # Recursive file navigator
│   ├── settings-dialog/          # Settings tabs: Providers, Models, Appearance, Storage
│   └── terminal/                 # Embedded xterm terminal panel
│
├── lib/
│   ├── agent/
│   │   ├── model-catalog.ts      # Static model list (source of truth)
│   │   ├── model-gateway.ts      # Creates provider model from request-scoped credential
│   │   ├── model-gateway-types.ts
│   │   ├── assistant-provider.tsx # Client-side tool executor + useChat bridge
│   │   ├── tool-schemas.ts       # Tool input schemas (no execute() — all client-side)
│   │   ├── tools/                # Concrete tool implementations
│   │   │   ├── bash.ts
│   │   │   ├── read-notebook.ts
│   │   │   ├── read-cell.ts
│   │   │   ├── insert-cell.ts
│   │   │   ├── execute-cell.ts
│   │   │   └── … (one file per tool)
│   │   ├── subagents/
│   │   │   ├── registry.ts       # Discovers *.agent.ipynb notebooks
│   │   │   ├── client-runner.ts  # Runs a subagent as a nested chat loop
│   │   │   └── types.ts
│   │   ├── context-manager.ts    # Builds agent context injected into each request
│   │   ├── agent-system-prompt.ts
│   │   └── token-budget.ts
│   ├── skills/
│   │   ├── discovery.ts          # Scans skill directories for SKILL.md files
│   │   ├── skill-registry.ts
│   │   ├── parse-frontmatter.ts
│   │   └── types.ts
│   ├── chat/
│   │   ├── chat-storage.ts       # IndexedDB persistence (bump DB_VERSION on schema change)
│   │   ├── chat-references.ts    # Cell/file reference metadata attached to messages
│   │   └── compaction-client.ts  # Context-window compaction via /api/chat
│   ├── notebook/
│   │   ├── notebook-parser.ts    # .ipynb JSON → internal type
│   │   ├── cell-executor.ts      # Kernel execution via JupyterLab services
│   │   └── mime-registry/        # MIME type priority and synthetic MIME handling
│   ├── kernel/
│   │   ├── kernel-service.ts     # Jupyter kernel lifecycle management
│   │   └── kernel-storage.ts     # Persists last-used kernel config
│   ├── shell/
│   │   ├── terminal-executor.ts  # Runs bash commands in a persistent shell
│   │   ├── terminal-pool.ts      # Manages multiple terminal sessions
│   │   └── system-commands/      # Glob, grep, open-file (used by agent tools)
│   ├── settings/
│   │   ├── schema.ts             # Zod schema for all settings (credentials, prefs, …)
│   │   ├── defaults.ts
│   │   └── user-storage.ts       # localStorage-backed settings persistence
│   └── credentials/
│       └── chatgpt-oauth.ts      # ChatGPT OAuth device flow client
│
├── contexts/                     # React contexts (settings, view mode, layout)
├── hooks/                        # Shared React hooks
├── types/                        # Global TypeScript declarations
└── docs/                         # This directory
```

## Request Flow

A typical chat turn:

```
Browser (RightSidebar)
  │
  │  POST /api/chat
  │  { messages, provider, model, userCredential, agentContext }
  │
  ▼
app/api/chat/route.ts
  ├─ Validates model/provider against MODEL_CATALOG
  ├─ Rejects missing credential with a clear setup error
  ├─ ModelGateway.create(userCredential) → provider model instance
  ├─ ContextManager injects notebook state, workspace, skills, subagents
  └─ streamText() → Server-Sent Events back to browser

Browser (AssistantProvider / useChat)
  ├─ Streams assistant text into message list
  └─ On tool_call events → executeToolCall(name, args)
       ├─ Notebook tools  → lib/agent/tools/* (reads/writes open notebook)
       ├─ Bash/terminal   → lib/shell/terminal-executor.ts
       ├─ File tools      → JupyterLab ContentsManager
       └─ Subagent tool   → lib/agent/subagents/client-runner.ts
            └─ (nested loop: POST /api/chat with subagent system prompt)

Tool result → streamed back into model loop as tool_result message
```

Key invariant: **the server never executes tools**. `tool-schemas.ts` defines schemas only. Every tool call is dispatched and executed in the browser, then the result is sent back to `/api/chat` as a continuation turn.

## Static Model Catalog

`lib/agent/model-catalog.ts` is the single source of truth for model metadata:

- provider ownership (`provider_id`)
- model IDs as expected by each provider SDK
- display labels and context window sizes
- default pinned state
- pricing metadata (display only)

`GET /api/models` returns this catalog unauthenticated. The settings Models tab and the right-sidebar model selector both read from it. To add a model, edit `model-catalog.ts` — there is no database.

## BYOK Credentials

Three credential types are supported, all stored in browser `localStorage`:

| Type | How to configure |
|---|---|
| API key | Settings → Providers → enter key for OpenAI / Anthropic / Google / xAI |
| ChatGPT OAuth | Settings → Providers → Connect ChatGPT (device flow via `/api/credentials/oauth/`) |
| Local endpoint | Settings → Providers → configure Ollama or LM Studio with a base URL and model ID |

The selected credential is sent as `userCredential` in every `/api/chat` request. The server creates the provider model from that credential; no server-side API keys are used.

## Local Storage

| Store | What | Location |
|---|---|---|
| IndexedDB | Chat history, messages, compaction summaries, subagent sessions | `lib/chat/chat-storage.ts` |
| `localStorage` | Settings, credentials, pinned models, workspace prefs | `lib/settings/user-storage.ts` |
| `localStorage` | Last Jupyter kernel config | `lib/kernel/kernel-storage.ts` |

When changing the IndexedDB schema — stores, indexes, key paths, or the shape of persisted data — increment `DB_VERSION` in `lib/chat/chat-storage.ts`. Browsers refuse to open a database whose on-disk version exceeds the requested version.

## Jupyter Integration

Notebook execution goes through JupyterLab services (`@jupyterlab/services`). The kernel service in `lib/kernel/kernel-service.ts` manages kernel lifecycle (connect, restart, shutdown). Cell execution is handled by `lib/notebook/cell-executor.ts`.

Agent tools that touch notebooks (`use_notebook`, `execute_cell`, `read_cell`, etc.) go through `lib/agent/tools/notebook-manager.ts`, which tracks which notebooks are open and routes operations to the right kernel.

To test Jupyter-dependent features locally, start a Jupyter server and configure the connection under **Settings → Jupyter**.

## Skills

Skills are markdown files with YAML frontmatter. Orion discovers them from:

- `<jupyter-server-root>/.agents/skills/<skill-name>/SKILL.md`
- `<jupyter-server-root>/.orion/skills/<skill-name>/SKILL.md`
- Same paths under the active workspace directory (project-level, takes precedence)

Discovery runs through `lib/skills/discovery.ts`. The skill's content is injected into the system prompt only when the skill is invoked. Slash commands are auto-generated for each discoverable skill.

Example skill file:

```markdown
---
name: data-profiler
description: Profiles tabular data and summarizes quality issues.
---

Inspect the active dataset. Identify schema, missingness, distributions,
and any surprising values. Summarize findings as a markdown report.
```

## Sub-Agents

Sub-agents are `.agent.ipynb` notebook files discovered from:

- `<jupyter-server-root>/.agents/subagents/`
- `<jupyter-server-root>/.orion/subagents/`
- Same paths under the active workspace directory

The registry (`lib/agent/subagents/registry.ts`) reads each notebook and validates its structure. A valid sub-agent notebook has exactly three required markdown cells in order:

1. **H1 heading** — the sub-agent's display name (`# My Agent`)
2. **Description cell** — one or more paragraphs describing what the agent does
3. **System prompt cell** — the full system prompt injected for that agent's chat loop

Optional: set `metadata.orion.subagent.model` in the notebook JSON to pin the sub-agent to a specific model. If omitted, it inherits the parent chat model.

When a sub-agent is invoked, `client-runner.ts` starts a nested chat loop — a separate sequence of `/api/chat` calls with the sub-agent's system prompt, running until the task completes or the step limit is reached.

## Context Compaction

When the context window approaches its limit, `lib/chat/compaction-client.ts` triggers a compaction run: it sends the current message history to `/api/chat` with a summarization prompt, stores the resulting summary in IndexedDB alongside the chat, and replays only the summary + recent messages in subsequent turns.

Compaction uses the same BYOK credential and model as the active chat session.

## Settings Architecture

All settings are defined in `lib/settings/schema.ts` as a Zod schema. The `useOrionSettings` hook provides typed read/write access to settings from any component. Settings are versioned (`SETTINGS_SCHEMA_VERSION`); migrations run in `lib/settings/migrations.ts`.

Provider credentials live inside the settings object and are stored in `localStorage`. They are never sent to the server except as part of the `userCredential` field in `/api/chat` requests.
