# Orion Development Guidelines

## Development Workflow

- **DO NOT** run `npm run dev`, `npm run build`, `npm run start`, etc. unless explicitly requested by the user. You can run lint and tsc/tsx commands to check for errors and fix them.
- For installing packages, use `npm install --legacy-peer-deps` command.
- Check correct root directory (`/Users/nicolasfonteyne/GitHub_nicolasakf/Orion`) before package installs

## Code Style Guidelines

- **TypeScript**: Use strict typing (`strict: true`). Avoid `any` types or loose types, only use it when necessary.
- **API Validation**: Always create mock validations using zod for external API responses
- **Components**: Prefer functional components with hooks. Use memoization for performance-critical components
- **Imports**: Group imports by type (React, components, utils, types) with blank lines between groups
- **Functions**: Use function comments for complex logic. Prefer useCallback for functions passed as props
- **Names**: Use PascalCase for components/interfaces, camelCase for variables/functions
- **CSS**: Use Tailwind utility classes via `cn()` for combining conditional classes
- **State**: Prefer local state with useState. Use debouncing for frequent updates
- **Error Handling**: Use try/catch for async operations only where exceptions are expected and can be meaningfully handled
- **Performance**: Minimize unnecessary renders with memo(), useCallback() and useEffect() dependency arrays

## Server-only modules

- For modules that are sensitive or must be enforced server-side only (secrets, billing, Stripe, privileged DB access, etc.), add `import "server-only"` at the top of the file so Next.js fails the build if client code imports them.

## Documentation & Type Annotations

- Document all functions/methods/classes when creating/editing them
- Exception: Simple functions with no args/return can have brief 1-2 line comments

## Prompts & agent instructions (avoid redundancy)

- **One source of truth** for a given behavior: if instructions already live in a **loadable skill** (e.g. `SKILL.md`), a **tool description**, or a **dedicated module**, do **not** copy the same rules into the **system prompt** (or into another place that will load alongside it) unless there is a clear, documented reason.
- **Prefer the layer that always applies** for truly global invariants; **prefer the skill (or other injected content)** for workflow-specific or optional behavior that is only relevant after `load_skill` (or similar) runs.
- Repeating the same policy in multiple prompt surfaces drifts, doubles maintenance, and confuses which place to edit. When you add or change agent-facing text, ask: is this **new** information or a **duplicate** of something already defined elsewhere? Remove or consolidate duplicates.
- Example: workflow rules for a skill belong in that skill’s `SKILL.md` after `load_skill` — avoid restating them in `buildAgentSystemPrompt` (or the opposite) unless the model must see them *before* any tool call and that cannot be achieved another way.
