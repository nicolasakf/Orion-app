---
name: add-or-update-models
description: Adds new LLM models to the Orion model catalog or updates existing ones. Searches for model availability via provider APIs, looks up token pricing from official docs, and edits lib/agent/model-catalog.ts. Use when adding models, updating model pricing, labels, context limits, long-context pricing, client_avail, or pinned_by_default.
---

# Add or Update Models

Adds new models to `MODEL_CATALOG` in `lib/agent/model-catalog.ts` or updates existing entries with correct pricing and metadata. The catalog is the single source of truth — there is no Supabase/database layer.

## When to use this skill

- **Add**: New model from a provider (e.g. GPT-5.6, Claude Opus 4.8)
- **Update**: Existing model with new pricing, label, context limits, long-context pricing, `client_avail`, or `pinned_by_default` changes

## Architecture

| Layer | File | Role |
|-------|------|------|
| Catalog | `lib/agent/model-catalog.ts` | Checked-in model metadata (pricing, labels, limits) |
| API | `app/api/models/route.ts` | Serves `CLIENT_MODEL_CATALOG` (catalog filtered by `client_avail`) |
| Gateway defaults | `lib/agent/model-gateway.ts` | `MODEL_DEFAULTS` — runtime context window and streaming flags |

## Workflow

### 1. Identify the model and provider

- **model_id**: Exact API identifier (e.g. `gpt-5.2`, `gemini-2.5-flash`, `claude-sonnet-4-5`, `grok-4-1-fast-reasoning`)
- **provider_id**: One of `openai`, `google`, `anthropic`, `xai`, `ollama`, `lmstudio`, `mlx`, `custom` (must match `SupportedProvider` in `lib/agent/model-gateway-types.ts`)
- **label**: Human-readable display name (e.g. `GPT-5.2`, `Gemini 2.5 Flash`)

For updates, confirm the `model_id` matches an existing catalog entry.

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
| `cached_price_per_1m` | Cached prompt price (if applicable); use `null` if not offered |
| `long_context_threshold` | Token count above which higher rates apply; use `null` if not applicable |
| `long_context_input_price_per_1m` | Input price per 1M when above threshold; use `null` if not applicable |
| `long_context_output_price_per_1m` | Output price per 1M when above threshold; use `null` if not applicable |

**Pricing sources** (use Standard tier unless Batch/Flex is required):

- **OpenAI**: https://developers.openai.com/api/docs/pricing
- **Google**: https://ai.google.dev/gemini-api/docs/pricing#standard_12
- **Anthropic**: https://platform.claude.com/docs/en/about-claude/pricing
- **xAI**: https://docs.x.ai/developers/models

### 4. Look up context and output limits

- **context_window**: Max input tokens (e.g. 128000, 1048576)
- **max_output_tokens**: Max output tokens (e.g. 4096, 65536); use `null` if unknown

### 4b. Long-context pricing (optional)

Some providers charge higher rates when input exceeds a threshold. If applicable:

- **long_context_threshold**: Token count above which higher rates apply (e.g. 200000 for Anthropic/Google, 272000 for GPT-5.4)
- **long_context_input_price_per_1m**: Input price per 1M when above threshold
- **long_context_output_price_per_1m**: Output price per 1M when above threshold

Use `null` for all three if the model has no long-context tier. Common patterns: Anthropic/Google >200K (often 2× input, 1.5× output); OpenAI GPT-5.4 >272K.

### 5. Edit the model catalog

Edit `lib/agent/model-catalog.ts`:

- **Add**: Append a new object to the `MODEL_CATALOG` array (or insert in the provider group — see ordering below).
- **Update**: Find the entry by `model_id` and change the relevant fields.

Use the existing `CATALOG_CREATED_AT` constant for `created_at` on new entries.

#### Add new model

```ts
{
  model_id: "<model_id>",
  label: "<label>",
  provider_id: "<provider_id>",
  input_price_per_1m: <input>,
  output_price_per_1m: <output>,
  cached_price_per_1m: <cached_or_null>,
  context_window: <context>,
  max_output_tokens: <max_out_or_null>,
  long_context_threshold: <long_ctx_threshold_or_null>,
  long_context_input_price_per_1m: <long_ctx_input_or_null>,
  long_context_output_price_per_1m: <long_ctx_output_or_null>,
  client_avail: true,
  pinned_by_default: false,
  created_at: CATALOG_CREATED_AT,
},
```

#### Update existing model

Locate the entry by `model_id` and update only the fields that changed (pricing, label, context, `client_avail`, etc.). Do not change `model_id` unless renaming is explicitly requested.

#### Catalog ordering

Keep entries grouped logically:

1. Local providers (`ollama`, `lmstudio`, `mlx`, `custom`) at the top
2. Flagship / pinned models next (`pinned_by_default: true`)
3. Remaining models grouped by provider, generally newest first within each group

#### Visibility flags

- **client_avail**: `true` exposes the model in the UI and `/api/models`; `false` hides it (e.g. unreleased or deprecated models kept for reference)
- **pinned_by_default**: `true` shows the model in the default pinned set in the model picker
- **supports_image_input** (optional): Omit for hosted providers (defaults to `true` via `defaultSupportsImageInput`); set explicitly only when overriding

### 6. Add or update MODEL_DEFAULTS entry

If the model is callable by the agent, add or update an entry in `MODEL_DEFAULTS` inside `lib/agent/model-gateway.ts`:

```ts
"<model_id>": { contextWindow: <context_window>, supportsStreaming: true },
```

Every hosted model in `MODEL_CATALOG` with `client_avail: true` should have a matching `MODEL_DEFAULTS` entry.

### 7. Validate

Run TypeScript check on touched files:

```bash
npx tsc --noEmit
```

## Catalog schema (`ModelCatalogEntry`)

| Field | Type | Required |
|-------|------|----------|
| model_id | string | yes |
| label | string | yes |
| provider_id | SupportedProvider | yes |
| input_price_per_1m | number \| null | no |
| output_price_per_1m | number \| null | no |
| cached_price_per_1m | number \| null | no |
| context_window | number \| null | no |
| max_output_tokens | number \| null | no |
| supports_image_input | boolean | no (derived for hosted models) |
| long_context_threshold | number \| null | no |
| long_context_input_price_per_1m | number \| null | no |
| long_context_output_price_per_1m | number \| null | no |
| client_avail | boolean | yes |
| pinned_by_default | boolean | yes |
| created_at | string (ISO) | yes |

## Provider IDs

Hosted providers: `openai`, `google`, `anthropic`, `xai`.

Local providers: `ollama`, `lmstudio`, `mlx`, `custom` (use the fixed `*-local` model IDs already in the catalog).

To add a **new hosted provider**, also update:

- `SupportedProvider` in `lib/agent/model-gateway-types.ts`
- `isKnownProvider()` in `lib/agent/model-catalog.ts`
- `PROVIDER_INFO` in `lib/agent/model-gateway.ts`

## Additional resources

- For pricing details and tier differences, see [reference.md](reference.md)
- For catalog edit examples, see [examples.md](examples.md)
