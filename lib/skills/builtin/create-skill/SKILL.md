---
name: create-skill
description: Authors new workspace SKILL.md files under .agents/skills by default; use .orion/skills for Orion-only overrides of the same skill name. Use when the user wants to add, create, or scaffold a skill, SKILL.md format, or skill best practices — not when they only want the domain work done without a new skill file.
disable-model-invocation: false
---

# Creating user-defined skills in Orion

## Critical — you are the skill author, not the skill in disguise

`create-skill` is a **meta-skill**: your job in this turn is to **create or update** `SKILL.md` (and optional companion files) on the Jupyter workspace. The user’s message is almost always a **specification** for the *new* skill (what a *future* turn should do after someone loads that skill), **not** a request for you to perform that domain work in this chat.

| Wrong | Right |
|-------|--------|
| The user pastes a long description of a workflow (e.g. how to write articles, how to run EDA) and you **do that work** or **speak in-character** as that workflow. | You treat that text as the **content** to encode: choose a `name`, **write** `.agents/skills/<name>/SKILL.md` by default (or `.orion/skills/<name>/SKILL.md` when overriding for Orion only), add e.g. `reference.md` if needed, then tell them where it was saved. |
| You output the deliverable the future skill would produce (a full article, a cleaned dataset, a chart) when they asked to “make a skill for …”. | You output **files** and a short summary; the deliverable of *this* turn is the **skill package**, not the end-user artifact. |

**Exception:** If the user only asks about format, storage paths, or best practices—with **no** new skill to author—answer helpfully and **do not** invent a file unless they confirm they want it.

Orion loads **workspace skills** from the Jupyter workspace: each skill is a directory containing `SKILL.md`. They merge with built-in skills; a workspace skill **overrides** a built-in skill with the **same `name`** in frontmatter.

If the same `name` appears in more than one folder, **precedence** when **loading** (lowest to highest) is:

- **User (server root):** `.agents/skills` → `.orion/skills` (Orion tweaks override the shared copy).
- **Project (when a workspace root is set):** `.agents/skills` → `.orion/skills` (project layers load after user layers, so project `.orion` can override everything below it).

**Authoring rule:** **Default** new and updated skills to **`.agents/skills/<name>/`** so shared repos and other agent tooling can use the same tree.

When the user needs an **Orion-specific** version of a skill that also exists under `.agents`, add or edit **`.orion/skills/<name>/SKILL.md`** with the **same `name`** in frontmatter so it **overrides** the `.agents` copy in Orion only.

## Storage locations

All **project** paths below are relative to the **workspace root** (the directory Jupyter uses as the file root). **User** `.agents/skills` and `.orion/skills` sit at the Jupyter **server root** when you author globally.

| Location | Role |
|----------|------|
| `.agents/skills/<skill-name>/` | **Default** place to **write** new or updated skills (shared with other agents). |
| `.orion/skills/<skill-name>/` | Orion **override** — same `name` as `.agents` to specialize behavior in Orion. |

Each skill is a directory containing at least `SKILL.md`. Optional extras: `reference.md`, `examples.md`, `scripts/`, etc.

Example layout for a **new** skill (prefer `.agents`):

```
.agents/skills/
├── my-workflow/
│   ├── SKILL.md
│   └── reference.md
└── team-style-guide/
    └── SKILL.md
```

Orion-only tweak alongside it:

```
.orion/skills/
└── my-workflow/
    └── SKILL.md
```

Create parent directories as needed.

## Required `SKILL.md` format

Orion parses **YAML frontmatter** between `---` lines, then the markdown body. Required fields:

| Field | Rules |
|-------|-------|
| `name` | Lowercase letters, numbers, and single hyphens only (e.g. `my-workflow`, `data-pipeline`). Must match the skill’s logical id. |
| `description` | Non-empty, up to ~1024 characters. Written in **third person**. Include **what** the skill does and **when** to use it (trigger terms). |
| `disable-model-invocation` | Optional boolean. When `true`, Orion does not advertise the skill to the model for automatic loading, but the `/name` slash command can still load it. |

**Frontmatter compatibility**: Use **single-line** `name` and `description` values. Avoid multiline YAML block scalars (`>-`, `|`) so the frontmatter parser reads them reliably.

### Minimal example

```markdown
---
name: my-workflow
description: Standardizes quarterly CSV ingestion and validation. Use when importing spreadsheets, cleaning tabular data, or validating columns before analysis.
disable-model-invocation: false
---

# My workflow

## Steps
1. ...
```

### Description (third person)

Good: "Builds reproducible train/validation splits for tabular data. Use when preparing datasets for ML or when the user mentions stratified splits."

Avoid: "I can help you split data" or "You can use this to split data."

## How skills appear in Orion

- Built-in skills ship with the app; workspace skills are **discovered** from `.agents/skills` and `.orion/skills` via the Jupyter Contents API (see precedence above).
- After **creating or editing** a workspace skill file, the updated list may require a **new scan**. If a skill does not show under Available Skills: **reconnect the Jupyter kernel** or **reload the application** so the registry can refresh.

## Authoring principles

1. **Concise** — Assume the model is capable; add only domain-specific rules, templates, and constraints it would not infer.
2. **Progressive disclosure** — Keep `SKILL.md` focused; put long reference material in linked files at the same level (e.g. `reference.md`).
3. **Clear workflows** — Numbered steps, checklists, and explicit defaults beat vague prose.
4. **Stable terminology** — One term per concept throughout the skill.

## Implementation workflow (for the agent)

1. **Clarify** — Purpose, triggers, outputs, and any team or project conventions. If the user already pasted a full workflow in their first message, that **is** the spec: extract it into `SKILL.md` (do not treat it as a live task to complete in this chat).
2. **Write under `.agents/skills` by default** — Path is `.agents/skills/<name>/`. Use `.orion/skills/<name>/` only when the user wants an Orion-specific override of an existing shared skill.
3. **Choose `name`** — Kebab-case, specific (not `helper` or `utils`).
4. **Draft `description`** — Third person; what + when; include keywords users might say.
5. **Write the body** — Instructions, optional examples or templates.
6. **Create files** — Use `edit_file` (overwrite) to write `SKILL.md` on the Jupyter server. Create parent directories as needed by writing the full path (ContentsManager typically creates intermediate segments when saving).
7. **Remind** — Tell the user that if the new skill does not appear immediately, reconnect the kernel or reload the app.

## Anti-patterns

- Preferring `.orion/skills` for **every** new skill when `.agents/skills` is the shared default — use `.orion` for **overrides**, not by default.
- Skills outside the discovered directories — Orion does not load arbitrary paths as workspace skills.
- Mismatched `name` — Folder name and frontmatter `name` should align with the skill id users invoke (e.g. `/my-workflow`).
- Huge pasted blobs in `SKILL.md` — Split into separate files and link them.

## Quick checklist

- [ ] `.agents/skills/<skill-name>/SKILL.md` (or `.orion/...` only for Orion override) exists
- [ ] Frontmatter has `name` and `description` (single-line values)
- [ ] `name` matches `^[a-z0-9]+(-[a-z0-9]+)*$`
- [ ] Description is third person and includes trigger scenarios
- [ ] User knows they may need kernel reconnect / reload to see the skill listed
