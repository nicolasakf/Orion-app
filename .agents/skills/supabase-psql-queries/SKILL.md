---
name: supabase-psql-queries
description: Query Supabase database via psql CLI using $POSTGRES_URL_READONLY. Use when inspecting database state, checking table contents, or debugging data. Only SELECT queries are allowed—never INSERT, UPDATE, UPSERT, DELETE, or any other modifying queries.
---

# Supabase psql Queries

## Schema reference

To understand database schemas and table structures, consult `lib/database.types.ts`. It contains the generated TypeScript types that mirror the Supabase schema (tables, columns, relationships).

## Usage

Query the database via the psql CLI using the `$POSTGRES_URL_READONLY` environment variable. This uses a read-only connection for safe inspection.

**If `POSTGRES_URL_READONLY` is not set**, source the project `.env` first:

```bash
# Source .env if the variable is not already available
[ -z "$POSTGRES_URL_READONLY" ] && set -a && source .env && set +a

psql "$POSTGRES_URL_READONLY" -c "SELECT * FROM provider"
```

The `set -a` / `set +a` ensures variables from `.env` are exported to the environment.

## Critical restriction: SELECT only

**The agent must never run queries that modify the database.**

| Allowed | Forbidden |
|---------|-----------|
| `SELECT` | `INSERT` |
| | `UPDATE` |
| | `UPSERT` |
| | `DELETE` |
| | `TRUNCATE` |
| | `ALTER` |
| | `DROP` |
| | `CREATE` |
| | Any DDL or DML that changes data |

Use this skill only to **inspect** and **read** data. For schema changes, use migrations (see write-supabase-migrations skill). For data changes, the user must run those queries manually.

## Examples

```bash
# Ensure POSTGRES_URL_READONLY is available (source .env if needed)
[ -z "$POSTGRES_URL_READONLY" ] && set -a && source .env && set +a

# List all rows from a table
psql "$POSTGRES_URL_READONLY" -c "SELECT * FROM provider"

# Limit results
psql "$POSTGRES_URL_READONLY" -c "SELECT * FROM model LIMIT 10"

# Filter with WHERE
psql "$POSTGRES_URL_READONLY" -c "SELECT id, name FROM provider WHERE id = 'openai'"

# Inspect schema
psql "$POSTGRES_URL_READONLY" -c "\dt"
```
