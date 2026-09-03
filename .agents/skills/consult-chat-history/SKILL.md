---
name: consult-chat-history
description: Inspects Orion chat session history while debugging. Prefers repo logs/{chatId}.log in development; falls back to the local SQLite DB (~/.orion/orion.db) in production when those log files are not written. Use when debugging chat turns, reconstructing what was sent to the model, inspecting tool calls or stream errors, or reading a session transcript.
disable-model-invocation: false
---

# Consult chat session history

Use this skill when debugging Orion itself and you need the transcript or wire payload of a chat session.

This is not the shipped product skill `chat-history` (end-user lookup of past chats). Stay read-only.

## Choose the source

1. **Development** (`NODE_ENV=development`, typically `npm run dev`, `npm run dev:notebook`, or `npm run dev:desktop`): prefer `logs/` at the Orion-app repo root.
2. **Production** (packaged app, `orion` CLI, or any run where `NODE_ENV` is not `development`): `logs/` is not written. Use SQLite.

Detect current mode before reading:

```bash
ls -lt logs/*.log 2>/dev/null | head
```

Treat it as **dev** when a log exists for the chat you care about (or a very recently modified `logs/*.log` if the chat id is unknown). Stale files from an earlier local run do not mean the *current* process is in development.

Treat it as **prod** when `logs/` is missing, empty, or has no file for that chat. Then query SQLite.

SQLite is populated in both modes. In dev, still start with the log: it has request/LLM/error/tool detail the DB does not. Use SQLite in dev only when you need the persisted UI transcript, titles, compaction, or goal state.

## Development: `logs/`

DevLogger (`lib/logging/dev-logger.ts`) writes only when `NODE_ENV === 'development'`. The directory is gitignored. Files can be large — list and search; do not slurp a whole log.

### File names

| File | What |
|------|------|
| `logs/{chatId}.log` | Main chat. Chat ids are millisecond timestamps (`Date.now().toString()`). |
| `logs/{parentChatId}-{agentName}#{n}.log` | Subagent run (`n` is the 1-based instance in that parent chat). |
| `logs/session-{requestId}.log` | Fallback when the request had no chat id. |

Unsafe characters in the stem are replaced with `_`.

### Find the session

```bash
ls -lt logs/*.log | head -20
```

If the user gave a chat id, open that file. Otherwise take the newest main-chat log (not a `*-{name}#n.log` subagent file) unless they asked about a subagent.

Confirm the session banner:

```text
ORION DEV SESSION STARTED
Log file: logs/{chatId}.log
```

### What to search

| Marker | Meaning |
|--------|---------|
| `[CHAT_REQUEST]` | Incoming `/api/chat` POST (model, provider, messages, context). |
| `[LLM_CALL]` | Payload after context injection (what the model actually received). |
| `[CONTEXT_INJECT]` | How the system prompt was injected. |
| `[CHAT_FINISH]` | Tokens, duration, cost. |
| `[CHAT_ERROR]` | Stream/gateway failure (`util.inspect` of the error). |
| `[BROWSER→SERVER] category=…` | Client events: `TOOL_DISPATCH`, `TOOL_RESULT`, `TOOL_ERROR`, `TOOL_SHELL_COMMAND`, `CHAT_HOOK`, `CONTEXT_BUILD_CLIENT`. |

```bash
rg -n "\[CHAT_ERROR\]|\[CHAT_REQUEST\]|\[LLM_CALL\]|\[CHAT_FINISH\]" logs/CHAT_ID.log
```

Read the surrounding block for the request id you care about. Match `[CHAT_REQUEST] id=` / `[LLM_CALL] id=` / `[CHAT_ERROR] id=` on the same UUID.

### Caveats

- Non-system message bodies are truncated (2000 chars on `CHAT_REQUEST`, 3000 on `LLM_CALL`). System prompts are logged in full.
- Client payloads are truncated at 3000 chars.
- Wire messages may include context-optimizer stubs; that is not necessarily what the UI persisted.

## Production: SQLite

Path: `$ORION_HOME_DIR/orion.db` if set, otherwise `~/.orion/orion.db`.

```bash
DB="${ORION_HOME_DIR:-$HOME/.orion}/orion.db"
test -f "$DB" && echo "found $DB" || echo "missing"
```

Open read-only. Do not write, vacuum, migrate, or delete.

```bash
sqlite3 "file:${DB}?mode=ro"
```

If the file is missing, say so. Dev `logs/` will not exist as a substitute in production.

### Useful tables

- `chats` — `id`, `title`, `created_at`, `updated_at`, `compaction_summary_json`, `forked_from_json`
- `chat_messages` — `chat_id`, `ordinal`, `role`, `timestamp`, `message_json` (AI SDK UI message; text in `$.parts[*].text` where `type = "text"`)
- `subagent_sessions` — `session_json` keyed by `chat_id` / `tool_call_id`
- `goal_session` / `goal_evaluation` — goal-loop state for that chat
- `chat_session`, `model_request`, `model_usage` — status and token/cost rows (`chat_session.local_chat_id` = chat id)

### Queries

Recent chats:

```bash
sqlite3 "file:${DB}?mode=ro" \
  "select id, title, updated_at from chats order by updated_at desc limit 20;"
```

Title search:

```bash
sqlite3 "file:${DB}?mode=ro" \
  "select id, title, updated_at from chats where title like '%keyword%' order by updated_at desc limit 20;"
```

Message text search:

```bash
sqlite3 "file:${DB}?mode=ro" \
  "select c.id, c.title, m.ordinal, m.role, m.timestamp
   from chat_messages m
   join chats c on c.id = m.chat_id
   where m.message_json like '%keyword%'
   order by c.updated_at desc, m.ordinal asc
   limit 50;"
```

One chat (raw JSON):

```bash
sqlite3 "file:${DB}?mode=ro" \
  "select ordinal, role, timestamp, message_json
   from chat_messages
   where chat_id = 'CHAT_ID'
   order by ordinal asc;"
```

Text parts (if `jq` is available):

```bash
sqlite3 -json "file:${DB}?mode=ro" \
  "select ordinal, role, timestamp, message_json
   from chat_messages
   where chat_id = 'CHAT_ID'
   order by ordinal asc;" |
jq -r '.[] | "[\(.ordinal)] \(.role) \(.timestamp)\n" +
  ((.message_json | fromjson | .parts // [])
    | map(select(.type == "text") | .text)
    | join("\n")) + "\n"'
```

Compaction summary, when present:

```bash
sqlite3 "file:${DB}?mode=ro" \
  "select title, compaction_summary_json from chats where id = 'CHAT_ID';"
```

## How to report

- Name the chat by id, title, and date.
- Say whether you read `logs/` or SQLite.
- Quote only the snippets needed; do not dump the full transcript unless asked.
- Distinguish retrieved facts from inference.
- If several chats match, list candidates and ask which to open.
- Past chats may contain secrets; inspect the minimum needed.
