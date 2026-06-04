# GitHub repository traffic archive

GitHub only keeps [traffic insights](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository) (clones, views, referrers, popular paths) for about **14 days**. This folder stores daily snapshots so history is not lost.

## What is collected

Matches the [Traffic](https://github.com/nicolasakf/Orion-app/graphs/traffic) graph:

| Metric | API |
|--------|-----|
| Clones (daily & weekly) | `GET /repos/{owner}/{repo}/traffic/clones?per=day\|week` |
| Views (daily & weekly) | `GET /repos/{owner}/{repo}/traffic/views?per=day\|week` |
| Popular content | `GET /repos/{owner}/{repo}/traffic/popular/paths` |
| Referring sites | `GET /repos/{owner}/{repo}/traffic/popular/referrers` |

## Layout

- `state.json` — merged time series (clones/views by timestamp) plus daily ranked snapshots for paths and referrers
- `snapshots/YYYY-MM-DD.json` — raw fetch for each collection day

## Automation

Workflow: [.github/workflows/collect-github-traffic.yml](../../.github/workflows/collect-github-traffic.yml)

Runs daily (and on demand). Requires a token with **push** access to this repository (the default `GITHUB_TOKEN` in Actions is sufficient).

## Manual run

```bash
export GITHUB_TOKEN="ghp_..."   # PAT with repo scope, or gh auth token
export GITHUB_REPOSITORY="nicolasakf/Orion-app"
npx tsx scripts/collect-github-traffic.ts
```
