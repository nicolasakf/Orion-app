<p align="center">
  <img src="./public/assets/Cover%20Photo%203.png" width="800" alt="Orion — Master your data, speed your research">
</p>

**Orion** is an open-source AI coding agent built for **data scientists, analysts, and researchers**—inside a notebook IDE that understands both your **code** and **runtime notebook state** (cells, outputs, tracebacks, structure, and run order). The goal is to **close the context gap**: fewer wrong columns, guessed names, or edits that look fine but do not match what actually executed.

- Connect from the browser to **your local Jupyter** environment—same notebooks, kernels, and env; no file uploads or redoing setup for Orion’s sake.
- Use **frontier models** from providers you choose, or **local inference** (e.g. LM Studio, Ollama). Credentials are configured in the app; **self-hosted usage does not require an Orion account or hosted backend**.
- **Privacy:** Orion does not use your notebooks, data, or code to train or improve the product ([website](https://www.orion-agent.ai)).

## Quick start

**Prerequisites:** Node.js 20+

```bash
npm install --legacy-peer-deps
npm run dev
```

Open [http://localhost:3001](http://localhost:3001), then go to **Settings → Providers** to add your API keys.

For notebook execution, connect a Jupyter server (supports Jupyter ≥ 2.0.0). Follow the instructions in the GUI.

## Links

| | |
| --- | --- |
| Website | [orion-agent.ai](https://www.orion-agent.ai) |
| Hosted app | [app.orion-agent.ai](https://app.orion-agent.ai) |
|

## Documentation

- [Contributing](./CONTRIBUTING.md) — setup, tests, pull requests
- [Architecture](./docs/architecture.md) — how the app fits together
- [Agent API](./docs/agent-api.md) — tools, skills, sub-agents, adding models

## Tech stack

Next.js 15, React 19, Tailwind CSS, Monaco Editor, Vercel AI SDK, JupyterLab services.

## License

Apache-2.0. See [LICENSE](./LICENSE).
