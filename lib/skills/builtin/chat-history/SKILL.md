---
name: chat-history
description: Teaches Orion agents how to inspect and reference past chats stored in the local SQLite database at `~/.orion/orion.db`. Use when the user asks about previous chats, prior conversations, chat history, remembered decisions, earlier instructions, or finding messages from past Orion sessions.
---

# Chat history

## Full documentation

For extended user guides, privacy notes, and example requests beyond this skill file, read:
https://docs.orion-agent.ai/ai-assistant/builtin-skills/chat-history.html

Use this skill when the user asks to find, summarize, quote, or refer to past Orion chats.

## Storage

Orion stores chat history in SQLite:

```txt
~/.orion/orion.db
```

The database is local to the Orion host. Query it read-only unless the user explicitly asks for maintenance and the task is clearly destructive-safe. Prefer read-only shell commands.

## Privacy and safety

- Past chats may contain private code, data paths, credentials pasted by mistake, or sensitive user context.
- Only inspect the amount needed for the user's request.
- Do not dump entire conversations unless the user explicitly asks.
- Do not write, delete, vacuum, migrate, or repair the database while using this skill.
- If asked to quote, quote only the relevant snippets and identify the chat title/date when useful.

## Schema

Current tables:

```sql
chats (
  id text primary key,
  title text not null,
  created_at text not null,
  updated_at text not null,
  compaction_summary_json text
)

chat_messages (
  id text primary key,
  chat_id text not null,
  ordinal integer not null,
  role text not null,
  timestamp text not null,
  message_json text not null,
  foreign key (chat_id) references chats(id) on delete cascade
)

subagent_sessions (
  id text primary key,
  chat_id text not null,
  tool_call_id text not null,
  session_json text not null,
  created_at text not null,
  updated_at text not null,
  foreign key (chat_id) references chats(id) on delete cascade
)
```

`message_json` stores the AI SDK UI message payload as JSON. Text usually lives in `$.parts[*].text` where `type = "text"`.

## Query workflow

1. Confirm the database exists:

```bash
test -f "$HOME/.orion/orion.db" && echo "found" || echo "missing"
```

2. List recent chats:

```bash
sqlite3 "$HOME/.orion/orion.db" \
  "select id, title, updated_at from chats order by updated_at desc limit 20;"
```

3. Search chat titles:

```bash
sqlite3 "$HOME/.orion/orion.db" \
  "select id, title, updated_at from chats where title like '%keyword%' order by updated_at desc limit 20;"
```

4. Search message JSON text:

```bash
sqlite3 "$HOME/.orion/orion.db" \
  "select c.id, c.title, m.ordinal, m.role, m.timestamp
   from chat_messages m
   join chats c on c.id = m.chat_id
   where m.message_json like '%keyword%'
   order by c.updated_at desc, m.ordinal asc
   limit 50;"
```

5. Read messages for one chat:

```bash
sqlite3 "$HOME/.orion/orion.db" \
  "select ordinal, role, timestamp, message_json
   from chat_messages
   where chat_id = 'CHAT_ID'
   order by ordinal asc;"
```

If `jq` is available, extract text parts:

```bash
sqlite3 -json "$HOME/.orion/orion.db" \
  "select ordinal, role, timestamp, message_json
   from chat_messages
   where chat_id = 'CHAT_ID'
   order by ordinal asc;" |
jq -r '.[] | "[\(.ordinal)] \(.role) \(.timestamp)\n" +
  ((.message_json | fromjson | .parts // [])
    | map(select(.type == "text") | .text)
    | join("\n")) + "\n"'
```

6. Read compaction summary, when present:

```bash
sqlite3 "$HOME/.orion/orion.db" \
  "select title, compaction_summary_json from chats where id = 'CHAT_ID';"
```

## Answering from history

When reporting findings:

- Say which chat(s) you inspected by title and date.
- Distinguish exact retrieved facts from inference.
- Prefer concise summaries over large transcript dumps.
- If there are several plausible chats, show the candidates and ask which one to inspect more deeply.
- If the database is missing or empty, say that no local chat history is available.

## Useful read-only checks

Show tables:

```bash
sqlite3 "$HOME/.orion/orion.db" ".tables"
```

Show schema:

```bash
sqlite3 "$HOME/.orion/orion.db" ".schema chats" ".schema chat_messages" ".schema subagent_sessions"
```

Count chats:

```bash
sqlite3 "$HOME/.orion/orion.db" "select count(*) from chats;"
```
