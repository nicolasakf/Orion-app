# Orion

An open-source AI notebook IDE — code and markdown cells, Jupyter kernel execution, and an AI assistant with tools to read, edit, and run your notebooks.

Model credentials are configured in the app. No account or hosted backend required.

## Quick Start

**Prerequisites:** Node.js 20+

```bash
npm install --legacy-peer-deps
npm run dev
```

Open [http://localhost:3001](http://localhost:3001), then go to **Settings → Providers** to add your API keys.

For notebook execution, connect a Jupyter server (supports Jupyter >= 2.0.0). Follow the instructions in the GUI.

## Documentation

- [Contributing](./CONTRIBUTING.md) — setup, tests, pull requests
- [Architecture](./docs/architecture.md) — how the app fits together
- [Agent API](./docs/agent-api.md) — tools, skills, sub-agents, adding models

## Tech Stack

Next.js 15, React 19, Tailwind CSS, Monaco Editor, Vercel AI SDK, JupyterLab services.

## License

Apache-2.0. See [LICENSE](./LICENSE).
