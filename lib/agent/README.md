# Orion Agent Flow

This document summarizes Orion's agent architecture across the UI, `/api/chat`, model orchestration, and browser-side tool execution.

## Primary Files

- App shell: [`app/page.tsx`](../../app/page.tsx)
- Chat orchestration loop: [`components/right-sidebar/right-sidebar.tsx`](../../components/right-sidebar/right-sidebar.tsx)
- Chat API route: [`app/api/chat/route.ts`](../../app/api/chat/route.ts)
- Static model catalog: [`lib/agent/model-catalog.ts`](./model-catalog.ts)
- Model gateway: [`lib/agent/model-gateway.ts`](./model-gateway.ts)
- Client runtime/tool bridge: [`lib/agent/assistant-provider.tsx`](./assistant-provider.tsx)
- Tool schemas exposed to models: [`lib/agent/tool-schemas.ts`](./tool-schemas.ts)
- Tool implementations: [`lib/agent/tools/index.ts`](./tools/index.ts)
- Agent prompt: [`lib/agent/prompts/agent-system-prompt.md`](./prompts/agent-system-prompt.md)

## Request Flow

1. `RightSidebar` sends the current messages, selected provider/model, local model settings, workspace context, and a user-supplied credential to `/api/chat`.
2. `/api/chat` validates the provider/model against `MODEL_CATALOG`.
3. `/api/chat` rejects requests without a usable BYOK API key or ChatGPT OAuth credential.
4. `ModelGateway` creates the provider model instance from that request-scoped credential.
5. The server injects agent context and streams model output back to the browser.

All credentials are request-scoped and supplied by the user; no server-side provider keys are used.

## Tool Execution

`lib/agent/tool-schemas.ts` defines tool schemas only. The model can request tool calls, but the server does not execute notebook or filesystem tools.

The browser receives pending tool calls through `useChat`; `RightSidebar` dispatches them to `AssistantProvider.executeToolCall(...)`. The provider executes concrete tools against the local notebook, file tree, terminal, or Jupyter kernel, then sends the tool result back into the model loop.

## Local State

- Chat history is stored in IndexedDB through [`lib/chat/chat-storage.ts`](../chat/chat-storage.ts).
- Provider credentials and model settings are stored locally through the settings system.
- The static model catalog is the source of truth for model metadata, default pins, context windows, and provider ownership.

## Skills And Sub-Agents

- Skills are markdown files discovered from the configured skill locations and injected into the prompt only when invoked.
- Sub-agents are `.agent.ipynb` notebooks with the required name, description, and system-prompt cells. Delegation runs through the same BYOK credential path as the parent chat.

## Failure Paths

- Missing credential: `/api/chat` returns a structured error telling the user to configure the matching provider.
- Unknown model/provider: `/api/chat` rejects the request before model creation.
- Kernel unavailable: client-side tool calls are queued and resumed after the kernel connects.
- Tool execution failure: the client sends an error-shaped tool result so the model can recover.
