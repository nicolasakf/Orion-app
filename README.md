<p align="center">
  <img src="./public/assets/Cover%20Photo%204.png" width="800" alt="Orion — Master your data, speed your research">
</p>

**Orion** is the first open-source AI coding agent built specifically for **data scientists, analysts, and researchers**.

General-purpose coding agents weren't designed for data-heavy research workflows. They guess at column names, choke on large datasets, and optimize for *code that runs* rather than *results that make sense*. The root cause is the **context gap** between what a model can read from source files and what it can't see — your runtime state, live variable values, cell outputs, and actual data.

Orion closes that gap. Built around a modern notebook IDE, it feeds the right context to the model at the right time: variable inspector state, cell execution order, rich outputs, tracebacks, and dataframe structure. The agent iterates alongside you like a research partner — observing inputs, checking results, and adjusting until the outcome actually looks right.

## Quick start

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001), then go to **Settings → Providers** to add your API keys.

For notebook execution, connect a Jupyter server (supports Jupyter ≥ 2.0.0). Follow the instructions in the GUI.

## Links

| Description | Link |
| --- | --- |
| Website | [orion-agent.ai](https://www.orion-agent.ai) |
| Hosted app | [app.orion-agent.ai](https://app.orion-agent.ai) |

## Documentation

- [Contributing](./CONTRIBUTING.md) — setup, tests, pull requests
- [Architecture](./docs/architecture.md) — how the app fits together
- [Agent API](./docs/agent-api.md) — tools, skills, sub-agents, adding models

## Tech stack

Next.js 15, React 19, Tailwind CSS, Monaco Editor, Vercel AI SDK, JupyterLab services.

## License

Apache-2.0. See [LICENSE](./LICENSE).
