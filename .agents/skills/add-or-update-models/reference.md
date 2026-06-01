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

## Catalog conventions

| Scenario | Action |
|----------|--------|
| Add new model | Append (or insert in provider group) to `MODEL_CATALOG` in `lib/agent/model-catalog.ts` |
| Update pricing/metadata | Edit the existing entry in place by `model_id` |
| Hide from UI | Set `client_avail: false` |
| Show in default pinned set | Set `pinned_by_default: true` |
| Agent runtime config | Add/update `MODEL_DEFAULTS` in `lib/agent/model-gateway.ts` |

## Model ID conventions

- **OpenAI**: `gpt-5.2`, `gpt-4o`, `o3`, `gpt-4o-mini`
- **Google**: `gemini-2.5-flash`, `gemini-3-flash-preview`, `gemini-3.5-flash`, `gemma-3-27b-it`
- **Anthropic**: `claude-opus-4-6`, `claude-sonnet-4-5`, `claude-haiku-4-5` (API uses hyphenated IDs)
- **xAI**: `grok-4-1-fast-reasoning`, `grok-3-mini`, `grok-4`
- **Local**: Fixed IDs `ollama-local`, `lmstudio-local`, `mlx-local`, `custom-local` — do not add new local placeholder entries

## Free models

For free-tier models (e.g. Gemma, some Gemini free tiers): set `input_price_per_1m` and `output_price_per_1m` to `0`.

## Derived client catalog

`CLIENT_MODEL_CATALOG` is built at module load time:

- Filters to entries where `client_avail === true`
- Adds `supports_image_input` (defaults to `true` for hosted providers, `false` for local)

No separate client-side list to maintain — edit `MODEL_CATALOG` only.
