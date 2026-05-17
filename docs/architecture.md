# Architecture

Orion OSS is a standalone BYOK notebook IDE. It has no hosted account runtime, managed inference fallback, paid-plan gating, or web-search service.

## App Shell

`app/page.tsx` renders the editor and wraps the chat sidebar with `AssistantProvider`. Settings and chat history are local to the browser.

## Static Model Catalog

`lib/agent/model-catalog.ts` is the source of truth for model metadata:

- provider ownership
- labels
- context windows
- default pinned models
- pricing metadata for display/reference only

`/api/models` returns this catalog unauthenticated.

## BYOK Chat

`/api/chat` requires a request-scoped user credential. The client sends either:

- an API-key credential configured under **Settings → Providers**
- a ChatGPT OAuth credential from the local OAuth flow

The server validates the selected provider/model against the static catalog, creates the model through `ModelGateway`, injects agent context, and streams the response. Missing credentials are rejected with a clear setup error.

## Tool Execution

Tool schemas live in `lib/agent/tool-schemas.ts`, but tool execution is client-side. The server streams tool-call requests; `components/right-sidebar/right-sidebar.tsx` dispatches them to `AssistantProvider`, which executes notebook, file, terminal, and Jupyter operations in the browser runtime and sends results back into the model loop.

## Local Storage

Chat sessions are persisted in IndexedDB through `lib/chat/chat-storage.ts`. Provider credentials, model settings, and UI preferences are local settings. When changing IndexedDB schema or persisted chat shape, bump `DB_VERSION` in `lib/chat/chat-storage.ts`.

## Jupyter

Notebook execution depends on the configured Jupyter connection. Agent tools operate through the shared notebook manager and kernel service, so notebook open/save/execute flows should be manually checked when changing tool or kernel code.

## Skills And Sub-Agents

Skills are markdown files with frontmatter discovered from the configured skill paths. Sub-agents are `.agent.ipynb` notebooks with required name, description, and system-prompt cells. Both use the same BYOK credential path as the parent chat.
