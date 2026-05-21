# Contributing

Thanks for helping improve Orion.

## Prerequisites

- Node.js 20+
- Optional: Jupyter, if you want to test notebook execution locally

## Setup

Clone the repo, install dependencies, then run the dev server (hot reload, Turbopack):

```bash
git clone https://github.com/nicolasakf/Orion-app.git
cd Orion-app
npm install
npm run dev
```

The dev server runs on port 3001 by default. For a production-like local run, use `npm run build` and `npm run start` instead (see [README](./README.md#quick-start)).

Configure model credentials inside the app under **Settings → Providers**.

Optional environment:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

## Tests And Checks

```bash
npm test
npx tsc --noEmit
npm run lint
```

`npm test` includes a boundary guard that catches unwanted external service dependencies being introduced.

## Architecture

- [Architecture](./docs/architecture.md)
- [Agent API](./docs/agent-api.md)

## Pull Requests

- Keep changes focused and small when possible.
- Prefer conventional commit messages.
- Include tests for behavior changes.
- Update docs when changing setup, model credentials, static catalog metadata, skills, sub-agents, or Jupyter behavior.
