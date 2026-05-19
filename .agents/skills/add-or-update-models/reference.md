# Add or Update Models — Reference

## Pricing sources and conventions

### OpenAI
- **URL**: https://developers.openai.com/api/docs/pricing
- **Tiers**: Standard (default), Batch (50% off), Flex, Priority
- **Units**: $ per 1M tokens (input/output)
- **Cached**: Some models have "Cached input" — use that for `cached_price_per_1m`
- **Note**: Reasoning tokens (o-series) billed as output tokens

### Google (Gemini)
- **URL**: https://ai.google.dev/gemini-api/docs/pricing#standard_12
- **Tiers**: Standard (default), Batch (50% off)
- **Units**: $ per 1M tokens
- **Context tiers**: Some models have different rates for prompts ≤200k vs >200k — use the lower tier for `input_price_per_1m`/`output_price_per_1m`; set `long_context_threshold`, `long_context_input_price_per_1m`, and `long_context_output_price_per_1m` for the higher tier
- **Cached**: Context caching has separate rates; use storage + read price if applicable

### Anthropic (Claude)
- **URL**: https://platform.claude.com/docs/en/about-claude/pricing
- **Units**: $ per MTok (million tokens)
- **Cache**: 5-minute and 1-hour cache writes have multipliers; cache reads are 0.1× base
- **Note**: Use "Base Input Tokens" and "Output Tokens" for standard pricing

### xAI (Grok)
- **URL**: https://docs.x.ai/developers/models
- **Format**: `$X.XX ($Y.YY) / $Z.ZZ` = input (cached) / output
- **Units**: $ per 1M tokens
- **Context**: 2M for grok-4 models, 256000 for grok-4, 131072 for grok-3-mini

## Migration naming

| Scenario | Pattern | Example |
|----------|---------|---------|
| Add only | `YYYYMMDD000000_add_<model_names>.sql` | `add_gpt53_and_opus46` |
| Update only | `YYYYMMDD000000_update_<model_names>.sql` | `update_gpt4o_mini_pricing` |
| Mixed | `YYYYMMDD000000_add_and_update_<descriptive>.sql` | `add_and_update_openai_models` |

## Upsert behavior

- **Add new model**: Use `on conflict (model_id) do nothing` for idempotent inserts.
- **Update existing model**: Use `on conflict (model_id) do update set ...` to refresh pricing, label, context, etc.
- **Add or update (flexible)**: Use `do update set` when the migration might run on both fresh and existing databases.

## Model ID conventions

- **OpenAI**: `gpt-5.2`, `gpt-4o`, `o3`, `gpt-4o-mini`
- **Google**: `gemini-2.5-flash`, `gemini-3-flash-preview`, `gemini-3.5-flash`, `gemma-3-27b-it`
- **Anthropic**: `claude-opus-4-6`, `claude-sonnet-4-5`, `claude-haiku-4-5` (API uses hyphenated IDs)
- **xAI**: `grok-4-1-fast-reasoning`, `grok-3-mini`, `grok-4`

## Free models

For free-tier models (e.g. Gemma, some Gemini free tiers): set `input_price_per_1m` and `output_price_per_1m` to `0`.
