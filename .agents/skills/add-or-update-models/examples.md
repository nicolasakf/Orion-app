# Add or Update Models — Examples

All examples edit `lib/agent/model-catalog.ts`. Add entries to the `MODEL_CATALOG` array or update existing objects in place.

## Add examples

### Example 1: Add a single new model (Claude Opus 4.6)

From Anthropic pricing: Claude Opus 4.6 — $5/MTok input, $25/MTok output, cache read $0.50/MTok. Context 1M tokens.

```ts
{
  model_id: "claude-opus-4-6",
  label: "Claude Opus 4.6",
  provider_id: "anthropic",
  input_price_per_1m: 5,
  output_price_per_1m: 25,
  cached_price_per_1m: 0.5,
  context_window: 1000000,
  max_output_tokens: 8192,
  long_context_threshold: 200000,
  long_context_input_price_per_1m: 10,
  long_context_output_price_per_1m: 37.5,
  client_avail: true,
  pinned_by_default: false,
  created_at: CATALOG_CREATED_AT,
},
```

Also add to `MODEL_DEFAULTS` in `lib/agent/model-gateway.ts`:

```ts
"claude-opus-4-6": { contextWindow: 1000000, supportsStreaming: true },
```

### Example 2: Add multiple models (GPT 5.3 family)

From OpenAI pricing (Standard tier): GPT-5.3 input $1.75, output $14; GPT-5.3 Pro input $21, output $168.

```ts
{
  model_id: "gpt-5.3",
  label: "GPT-5.3",
  provider_id: "openai",
  input_price_per_1m: 1.75,
  output_price_per_1m: 14,
  cached_price_per_1m: 0.175,
  context_window: 400000,
  max_output_tokens: 128000,
  long_context_threshold: null,
  long_context_input_price_per_1m: null,
  long_context_output_price_per_1m: null,
  client_avail: false,
  pinned_by_default: false,
  created_at: CATALOG_CREATED_AT,
},
{
  model_id: "gpt-5.3-pro",
  label: "GPT-5.3 Pro",
  provider_id: "openai",
  input_price_per_1m: 21,
  output_price_per_1m: 168,
  cached_price_per_1m: null,
  context_window: 400000,
  max_output_tokens: 128000,
  long_context_threshold: null,
  long_context_input_price_per_1m: null,
  long_context_output_price_per_1m: null,
  client_avail: false,
  pinned_by_default: false,
  created_at: CATALOG_CREATED_AT,
},
```

### Example 3: Add xAI model with cached pricing

From xAI docs: grok-4-1-fast-reasoning — $0.20 ($0.05 cached) / $0.50. Context 2M.

```ts
{
  model_id: "grok-4-1-fast-reasoning",
  label: "Grok 4.1 Fast Reasoning",
  provider_id: "xai",
  input_price_per_1m: 0.2,
  output_price_per_1m: 0.5,
  cached_price_per_1m: 0.05,
  context_window: 2000000,
  max_output_tokens: 30000,
  long_context_threshold: null,
  long_context_input_price_per_1m: null,
  long_context_output_price_per_1m: null,
  client_avail: true,
  pinned_by_default: false,
  created_at: CATALOG_CREATED_AT,
},
```

### Example 4: Add free model (Gemma)

```ts
{
  model_id: "gemma-3-27b-it",
  label: "Gemma 3 27B",
  provider_id: "google",
  input_price_per_1m: 0,
  output_price_per_1m: 0,
  cached_price_per_1m: null,
  context_window: 131072,
  max_output_tokens: 8192,
  long_context_threshold: null,
  long_context_input_price_per_1m: null,
  long_context_output_price_per_1m: null,
  client_avail: true,
  pinned_by_default: false,
  created_at: CATALOG_CREATED_AT,
},
```

## Update examples

### Example 5: Update existing model pricing

Find the entry by `model_id` and update pricing fields in place:

```ts
// Before
input_price_per_1m: 0.15,
output_price_per_1m: 0.6,
cached_price_per_1m: 0.075,

// After (OpenAI refreshed pricing)
input_price_per_1m: 0.12,
output_price_per_1m: 0.48,
cached_price_per_1m: 0.06,
```

### Example 6: Update label and context window

When a provider changes the display name or increases context limits:

```ts
// Update these fields on the existing entry
label: "Claude Sonnet 4.5 (Updated)",
context_window: 200000,
long_context_threshold: 200000,
long_context_input_price_per_1m: 6,
long_context_output_price_per_1m: 22.5,
```

Also update the matching `MODEL_DEFAULTS` entry if `context_window` changed:

```ts
"claude-sonnet-4-5": { contextWindow: 200000, supportsStreaming: true },
```

### Example 7: Hide a deprecated model

Set `client_avail: false` to remove it from the UI without deleting the catalog entry:

```ts
client_avail: false,
pinned_by_default: false,
```

### Example 8: Pin a flagship model

Set `pinned_by_default: true` so it appears in the default pinned set:

```ts
pinned_by_default: true,
```
