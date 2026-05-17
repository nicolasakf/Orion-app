---
name: write-supabase-migrations
description: Writes Supabase migration SQL files for Orion. Creates new migration files in supabase/migrations/ with correct naming and RLS policies. Use when adding tables, columns, or schema changes. NEVER runs migrations—only writes the files.
---

# Write Supabase Migrations

> **Critical:** This skill is for **writing** migration files only. The agent must **never** run `supabase db push`, `supabase migration repair`, or any command that applies or modifies migrations. The user runs those manually.

## Creating migrations

1. Inspect `lib/database.types.ts` to see current schemas (tables, columns, types).
2. Add a new SQL file in `supabase/migrations/`:
   ```
   YYYYMMDD000000_descriptive_name.sql
   ```
3. Use existing migrations as reference (e.g. `20260226000000_create_model_request_table.sql`).
4. Include RLS policies for new tables:
   - `alter table <table> enable row level security;`
   - Policies for select, insert, update, delete as needed.

## TypeScript types

**Do not edit `lib/database.types.ts` manually.** Just remember the user to run this command when they are done applying the migrations:

```bash
bash supabase/scripts/gen_types.sh
```

## Reference migrations

- `supabase/migrations/20260226000000_create_model_request_table.sql` — table creation with RLS
- `supabase/migrations/20260304000000_add_models_grok3_gemini31flashlite_o3mini.sql` — data inserts with upsert

## Additional resources

- For adding or updating LLM models in the database, see the add-or-update-models skill
