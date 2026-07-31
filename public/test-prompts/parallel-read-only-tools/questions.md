# Parallel read-only tools test prompts

Use these prompts as the **questions** for manual or automated agent-tool tests. This file intentionally contains only user-facing prompts. Do not include expected tool calls, scoring notes, or answers here; keep those in `answers.md`.

Assume the Orion project is open as the active workspace. Temporary artifacts for this suite belong under `.tmp/parallel-read-only/`.

## 1. Independent file read wave

Read `package.json`, `tsconfig.json`, `AGENTS.md`, and `vitest.config.ts` with file-reading tools, then summarize the purpose of each in one sentence. Perform independent reads concurrently when possible.

## 2. Twelve-file concurrency burst

Read all twelve files below with file-reading tools and give a short identifying phrase for each. These reads are independent, so request them together rather than using terminal commands or waiting for one result before requesting the next.

1. `package.json`
2. `tsconfig.json`
3. `tsconfig.cli.json`
4. `tsconfig.desktop.json`
5. `components.json`
6. `AGENTS.md`
7. `CLAUDE.md`
8. `vitest.config.ts`
9. `vitest.setup.ts`
10. `lib/types.ts`
11. `lib/utils.ts`
12. `lib/agent/tool-schemas.ts`

## 3. Failed read does not cancel siblings

Independently read `package.json`, `.tmp/parallel-read-only/does-not-exist.md`, and `tsconfig.json` at the same time. Do not create the missing file. Report the package name, the TypeScript target, and the read error for the missing path.

## 4. Read wave around a write barrier

Complete this as one ordered tool-call sequence when possible:

1. Create `.tmp/parallel-read-only/` with a terminal command so the ignored temporary directory also exists in a clean checkout.
2. Read `package.json` for its package name and `tsconfig.json` for its compiler target concurrently.
3. After both reads, write exactly `parallel barrier ok` to `.tmp/parallel-read-only/barrier-marker.md`.
4. After the write finishes, read the marker file back.

Report the package name, compiler target, and verified marker content.

## 5. Parallel official-source web research

Find the current stable releases of Python, Node.js, and TypeScript from their official project websites. Investigate the three projects concurrently where possible, then report each version with a direct official-source link.

## 6. Mixed local and web reads

Read the Node.js engine requirement from this repository's `package.json` and independently look up the current Node.js LTS release from the official Node.js website. Tell me whether the current LTS satisfies the repository requirement and cite the official release source.

## 7. Terminal calls remain ordered

Use two separate terminal commands to report the current Git branch and the installed Node.js version. Do not combine them into one shell command. Report both values.

## 8. Hidden-answer boundary

Run test 2 from this suite. Do not read `answers.md`, an evaluator skill, or any other answer-key material while performing it.
