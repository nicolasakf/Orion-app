---
name: orion-docs
description: Answers questions about using, configuring, understanding, or troubleshooting Orion from the official Orion documentation. Use for Orion product help, feature explanations, setup guidance, interaction modes, notebooks, providers, and troubleshooting; prefer a more specific built-in skill when the user asks Orion to perform the corresponding work.
---

# Orion documentation

Answer Orion product questions from the published user documentation instead of relying on memory.

## Full documentation

For the user guide to this built-in skill, read:
https://docs.orion-agent.ai/ai-assistant/builtin-skills/orion-docs.html

## Source of truth

Use only pages under:

https://docs.orion-agent.ai

Treat those pages as authoritative for user-facing Orion behavior. Do not substitute the Orion marketing site, search-result snippets, generic Jupyter documentation, or model memory for the official docs.

For developer or codebase-internals questions, inspect the Orion repository and its developer documentation instead. For questions about the user's notebook, files, kernel, or current workspace state, inspect that local state; do not treat them as general Orion product questions.

## Retrieval workflow

1. Identify the narrowest relevant documentation topic.
2. Fetch a known page directly with `web_fetch`. Published page URLs end in `.html`.
3. If the page is unknown or insufficient, call `web_search` with a focused query containing `site:docs.orion-agent.ai`, then fetch the most relevant result.
4. Base the answer on the fetched documentation and link the relevant page.
5. If the documentation does not answer the question, say so. Clearly label any inference from local state or repository evidence.
6. If the installed Orion UI conflicts with the published docs, describe the observed behavior and note that the published docs may describe a different release.

Useful entry points:

- Overview: https://docs.orion-agent.ai/getting-started/what-is-orion.html
- Installation: https://docs.orion-agent.ai/getting-started/install.html
- Notebook basics: https://docs.orion-agent.ai/notebooks/notebook-basics.html
- App View: https://docs.orion-agent.ai/notebooks/app-view.html
- Orion UI: https://docs.orion-agent.ai/notebooks/orion-ui.html
- Assistant overview: https://docs.orion-agent.ai/ai-assistant/chat-overview.html
- Interaction modes: https://docs.orion-agent.ai/ai-assistant/agent-ask-edit-modes.html
- Skills: https://docs.orion-agent.ai/ai-assistant/skills.html
- Providers: https://docs.orion-agent.ai/configuration/api-keys-and-providers.html
- Workspace settings: https://docs.orion-agent.ai/configuration/workspace-settings.html
- Troubleshooting: https://docs.orion-agent.ai/troubleshooting/index.html

## Skill boundaries

Use this skill for explanations and help. When the request becomes operational, load the narrower skill that owns the workflow:

- `orion-settings` for reading or changing settings files
- `orion-ui` for building interactive notebook UI
- `create-app` for authoring App View layouts
- `orion-metadata` for the notebook metadata contract
- `create-skill`, `create-rule`, or `create-subagent` for authoring those artifacts

Do not make changes merely because an informational question mentions a configuration or workflow.
