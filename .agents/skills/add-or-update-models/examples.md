# Add or Update Models — Examples

## Add examples

### Example 1: Add a single new model (Claude Opus 4.6)

From Anthropic pricing: Claude Opus 4.6 — $5/MTok input, $25/MTok output, cache read $0.50/MTok. Context 1M tokens.

**Migration** `supabase/migrations/20260210000000_add_opus46.sql`:

```sql
-- Add Claude Opus 4.6 (Anthropic)
-- Long-context: >200K at 2x input, 1.5x output
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
    ('claude-opus-4-6', 'Claude Opus 4.6', 'anthropic', 5, 25, 0.5, 1000000, 8192, 200000, 10, 37.5, true)
on conflict (model_id) do nothing;
```

### Example 2: Add multiple models (GPT 5.3 family)

From OpenAI pricing (Standard tier): GPT-5.3 input $1.75, output $14; GPT-5.3 Pro input $21, output $168.

```sql
-- Add GPT 5.3 family (OpenAI)
-- No long-context tier for these models
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
    ('gpt-5.3', 'GPT-5.3', 'openai', 1.75, 14, 0.175, 400000, 128000, NULL, NULL, NULL, false),
    ('gpt-5.3-pro', 'GPT-5.3 Pro', 'openai', 21, 168, NULL, 400000, 128000, NULL, NULL, NULL, false)
on conflict (model_id) do nothing;
```

### Example 3: Add xAI model with cached pricing

From xAI docs: grok-4-1-fast-reasoning — $0.20 ($0.05 cached) / $0.50. Context 2M.

```sql
-- xAI: no long-context tier
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
    ('grok-4-1-fast-reasoning', 'Grok 4.1 Fast Reasoning', 'xai', 0.2, 0.5, 0.05, 2000000, 30000, NULL, NULL, NULL, true)
on conflict (model_id) do nothing;
```

### Example 4: Add free model (Gemma)

```sql
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
    ('gemma-3-27b-it', 'Gemma 3 27B', 'google', 0, 0, NULL, 131072, 8192, NULL, NULL, NULL, true)
on conflict (model_id) do nothing;
```

## Update examples

### Example 5: Update existing model pricing (upsert)

Use `do update` when refreshing pricing for an existing model:

**Migration** `supabase/migrations/20260304000000_update_gpt4o_mini_pricing.sql`:

```sql
-- Update GPT-4o Mini pricing (OpenAI)
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
    ('gpt-4o-mini', 'GPT-4o Mini', 'openai', 0.15, 0.6, 0.075, 128000, 16384, NULL, NULL, NULL, false)
on conflict (model_id) do update set
    label = excluded.label,
    input_price_per_1m = excluded.input_price_per_1m,
    output_price_per_1m = excluded.output_price_per_1m,
    cached_price_per_1m = excluded.cached_price_per_1m,
    context_window = excluded.context_window,
    max_output_tokens = excluded.max_output_tokens,
    long_context_threshold = excluded.long_context_threshold,
    long_context_input_price_per_1m = excluded.long_context_input_price_per_1m,
    long_context_output_price_per_1m = excluded.long_context_output_price_per_1m;
```

### Example 6: Update label and context window

When a provider changes the display name or increases context limits:

```sql
-- Update Claude Sonnet 4.5 label and context
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
    ('claude-sonnet-4-5', 'Claude Sonnet 4.5 (Updated)', 'anthropic', 3, 15, 0.3, 200000, 8192, 200000, 6, 22.5, true)
on conflict (model_id) do update set
    label = excluded.label,
    context_window = excluded.context_window,
    long_context_threshold = excluded.long_context_threshold,
    long_context_input_price_per_1m = excluded.long_context_input_price_per_1m,
    long_context_output_price_per_1m = excluded.long_context_output_price_per_1m;
```

### Example 7: Add new models and update existing in one migration

```sql
-- Add GPT-5.3 and update GPT-4o Mini pricing
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
    ('gpt-5.3', 'GPT-5.3', 'openai', 1.75, 14, 0.175, 400000, 128000, NULL, NULL, NULL, false),
    ('gpt-4o-mini', 'GPT-4o Mini', 'openai', 0.15, 0.6, 0.075, 128000, 16384, NULL, NULL, NULL, false)
on conflict (model_id) do update set
    label = excluded.label,
    input_price_per_1m = excluded.input_price_per_1m,
    output_price_per_1m = excluded.output_price_per_1m,
    cached_price_per_1m = excluded.cached_price_per_1m,
    context_window = excluded.context_window,
    max_output_tokens = excluded.max_output_tokens,
    long_context_threshold = excluded.long_context_threshold,
    long_context_input_price_per_1m = excluded.long_context_input_price_per_1m,
    long_context_output_price_per_1m = excluded.long_context_output_price_per_1m;
```
