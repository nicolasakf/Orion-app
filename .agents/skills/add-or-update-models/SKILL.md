---
name: add-or-update-models
description: Adds new LLM models to the Orion database or updates existing ones. Searches for model availability via provider APIs, looks up token pricing from official docs, and creates Supabase migrations. Use when adding models, updating model pricing, labels, context limits, long-context pricing, or when the user asks to add or update a model in the database.
---

# Add or Update Models

Adds new models to the `models` table or updates existing ones with correct pricing and metadata. Follow the workflow below.

## When to use this skill

- **Add**: New model from a provider (e.g. GPT-5.3, Claude Opus 4.6)
- **Update**: Existing model with new pricing, label, context limits, long-context pricing, or `client_avail` changes

## Workflow

### 1. Identify the model and provider

- **model_id**: Exact API identifier (e.g. `gpt-5.2`, `gemini-2.5-flash`, `claude-sonnet-4-5`, `grok-4-1-fast-reasoning`)
- **provider_id**: One of `openai`, `google`, `anthropic`, `xai`
- **label**: Human-readable display name (e.g. `GPT-5.2`, `Gemini 2.5 Flash`)

For updates, confirm the `model_id` matches the existing row (it is the primary key).

### 2. Verify model availability

Check the provider's models API or docs to confirm the model exists and is callable:

- **OpenAI**: [Models API](https://platform.openai.com/docs/api-reference/models)
- **Google**: [Gemini models list](https://ai.google.dev/gemini-api/docs/models)
- **Anthropic**: [Claude models](https://docs.anthropic.com/en/docs/about-claude/models)
- **xAI**: [Models page](https://docs.x.ai/developers/models)

### 3. Look up pricing

Fetch pricing from the official docs. Prices are **per 1M tokens** in USD. Store as numeric (e.g. $0.30 → `0.30`).

| Field | Description |
|-------|-------------|
| `input_price_per_1m` | Input/prompt token price per 1M tokens (base tier) |
| `output_price_per_1m` | Output/completion token price per 1M tokens (base tier) |
| `cached_price_per_1m` | Cached prompt price (if applicable); use `NULL` if not offered |
| `long_context_threshold` | Token count above which higher rates apply; use `NULL` if not applicable |
| `long_context_input_price_per_1m` | Input price per 1M when above threshold; use `NULL` if not applicable |
| `long_context_output_price_per_1m` | Output price per 1M when above threshold; use `NULL` if not applicable |

**Pricing sources** (use Standard tier unless Batch/Flex is required):

- **OpenAI**: https://developers.openai.com/api/docs/pricing
- **Google**: https://ai.google.dev/gemini-api/docs/pricing#standard_12
- **Anthropic**: https://platform.claude.com/docs/en/about-claude/pricing
- **xAI**: https://docs.x.ai/developers/models

### 4. Look up context and output limits

- **context_window**: Max input tokens (e.g. 128000, 1048576)
- **max_output_tokens**: Max output tokens (e.g. 4096, 65536)

### 4b. Long-context pricing (optional)

Some providers charge higher rates when input exceeds a threshold. If applicable:

- **long_context_threshold**: Token count above which higher rates apply (e.g. 200000 for Anthropic/Google, 272000 for GPT-5.4)
- **long_context_input_price_per_1m**: Input price per 1M when above threshold
- **long_context_output_price_per_1m**: Output price per 1M when above threshold

Use `NULL` for all three if the model has no long-context tier. Common patterns: Anthropic/Google >200K (often 2× input, 1.5× output); OpenAI GPT-5.4 >272K.

### 5. Create the migration

Create a new file in `supabase/migrations/`:

- **Add only**: `YYYYMMDD000000_add_<model_names>.sql`
- **Update only**: `YYYYMMDD000000_update_<model_names>.sql`
- **Mixed**: `YYYYMMDD000000_add_and_update_<descriptive>.sql`

#### Add new model (insert only)

Use `on conflict (model_id) do nothing` when the model does not exist yet and you want a no-op on re-run:

```sql
-- Add <model_label> (<provider>)
insert into models (
    model_id,
    label,
    provider_id,
    input_price_per_1m,
    output_price_per_1m,
    cached_price_per_1m,
    context_window,
    max_output_tokens,
    long_context_threshold,
    long_context_input_price_per_1m,
    long_context_output_price_per_1m,
    client_avail
) values
    ('<model_id>', '<label>', '<provider_id>', <input>, <output>, <cached_or_null>, <context>, <max_out>, <long_ctx_threshold_or_null>, <long_ctx_input_or_null>, <long_ctx_output_or_null>, true)
on conflict (model_id) do nothing;
```

#### Add or update (upsert)

Use `on conflict (model_id) do update set ...` when:
- Adding a model that might already exist
- **Updating** an existing model (pricing, label, context, etc.)

```sql
-- Add/Update <model_label> (<provider>)
insert into models (
    model_id,
    label,
    provider_id,
    input_price_per_1m,
    output_price_per_1m,
    cached_price_per_1m,
    context_window,
    max_output_tokens,
    long_context_threshold,
    long_context_input_price_per_1m,
    long_context_output_price_per_1m,
    client_avail
) values
    ('<model_id>', '<label>', '<provider_id>', <input>, <output>, <cached_or_null>, <context>, <max_out>, <long_ctx_threshold_or_null>, <long_ctx_input_or_null>, <long_ctx_output_or_null>, true)
on conflict (model_id) do update set
    label = excluded.label,
    provider_id = excluded.provider_id,
    input_price_per_1m = excluded.input_price_per_1m,
    output_price_per_1m = excluded.output_price_per_1m,
    cached_price_per_1m = excluded.cached_price_per_1m,
    context_window = excluded.context_window,
    max_output_tokens = excluded.max_output_tokens,
    long_context_threshold = excluded.long_context_threshold,
    long_context_input_price_per_1m = excluded.long_context_input_price_per_1m,
    long_context_output_price_per_1m = excluded.long_context_output_price_per_1m,
    client_avail = excluded.client_avail;
```

### 6. Add or update MODEL_DEFAULTS entry (optional)

If the model is used by the agent, add or update an entry in `lib/agent/model-gateway.ts`:

```ts
"<model_id>": { contextWindow: <context_window>, supportsTools: true, supportsStreaming: true },
```

## Database schema

| Column | Type | Required |
|--------|------|----------|
| model_id | text | yes |
| label | text | yes |
| provider_id | text | yes (FK to provider.id) |
| input_price_per_1m | numeric | no |
| output_price_per_1m | numeric | no |
| cached_price_per_1m | numeric | no |
| context_window | int | no |
| max_output_tokens | int | no |
| long_context_threshold | int | no |
| long_context_input_price_per_1m | numeric | no |
| long_context_output_price_per_1m | numeric | no |
| client_avail | boolean | no (default true) |

## Provider IDs

Existing providers: `openai`, `google`, `anthropic`, `xai`. To add a new provider, first insert into `provider` table.

## Additional resources

- For pricing details and tier differences, see [reference.md](reference.md)
- For migration examples, see [examples.md](examples.md) and `supabase/migrations/`
