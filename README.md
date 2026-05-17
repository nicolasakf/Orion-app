# Orion

An open-source AI notebook IDE with integrated chat, Jupyter kernel support, local chat persistence, and bring-your-own-key model access.

## Features

- **Notebook editor** — Code and markdown cells with Monaco editor, syntax highlighting, and rich output rendering.
- **AI assistant** — Chat sidebar with tools to read and edit notebooks, run terminal commands, execute code, and work with Jupyter kernels.
- **BYOK providers** — Configure OpenAI, Anthropic, Google, xAI, or ChatGPT OAuth credentials locally in Settings.
- **Jupyter integration** — Connect to local or remote Jupyter kernels for Python execution.
- **Local persistence** — Chats and settings are stored in the browser with IndexedDB/local storage.
- **Skills and sub-agents** — Extend Orion with markdown skills and `.agent.ipynb` notebook-defined sub-agents.

## Tech Stack

- **Framework**: Next.js 15, React 19
- **UI**: Tailwind CSS, shadcn/ui, Monaco Editor
- **AI**: Vercel AI SDK with BYOK provider credentials
- **Notebooks**: JupyterLab services, custom notebook tools
- **Storage**: Browser-local settings and IndexedDB chat history

## Getting Started

### Prerequisites

- Node.js 20+
- Optional: a running Jupyter server for notebook execution

### Installation

```bash
npm install --legacy-peer-deps
```

### Environment

The OSS runtime does not require hosted app services or provider API keys in server environment variables.

Optional:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

Model credentials are configured in the app under **Settings → Providers**.

### Development

```bash
npm run dev
```

Runs on [http://localhost:3001](http://localhost:3001).

## Project Structure

```text
├── app/              # Next.js app router and local API routes
├── components/       # React components
│   ├── left-sidebar/ # File tree and search
│   ├── right-sidebar/# Chat UI, messages, toolbar
│   ├── notebook/     # Cells, output renderers, kernel dialogs
│   ├── editor/       # Main editor
│   └── ui/           # shadcn/ui primitives
├── lib/              # Core logic
│   ├── agent/        # Model gateway, tools, prompts, static catalog
│   ├── chat/         # IndexedDB chat persistence
│   └── ...           # Kernel service, settings, types, utils
└── hooks/            # React hooks
```

## License

Apache-2.0.
