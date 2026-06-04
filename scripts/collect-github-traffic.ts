/**
 * Fetches GitHub repository traffic metrics (14-day API window) and persists them
 * under data/github-traffic/ so history is not lost when GitHub rolls data off.
 */
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { fetchRepositoryTraffic, GitHubTrafficFetchError } from "../lib/github-traffic/fetch";
import {
  createEmptyTrafficState,
  GITHUB_TRAFFIC_STATE_VERSION,
  mergeTrafficSnapshot,
  type DailyTrafficSnapshot,
  type GitHubTrafficState,
} from "../lib/github-traffic/merge";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const dataDir = join(repoRoot, "data", "github-traffic");
const statePath = join(dataDir, "state.json");
const snapshotsDir = join(dataDir, "snapshots");

function utcDateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function parseRepository(repository: string): { owner: string; repo: string } {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new Error(
      `GITHUB_REPOSITORY must be "owner/repo" (got ${JSON.stringify(repository)})`,
    );
  }
  return { owner, repo };
}

async function readState(owner: string, repo: string): Promise<GitHubTrafficState> {
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as GitHubTrafficState;
    if (parsed.version !== GITHUB_TRAFFIC_STATE_VERSION) {
      throw new Error(`Unsupported state version: ${String(parsed.version)}`);
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return createEmptyTrafficState(owner, repo);
    }
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const repository = process.env.GITHUB_REPOSITORY?.trim();

  if (!token) {
    console.error("GITHUB_TOKEN is required (use the default Actions token or a PAT with repo scope).");
    process.exit(1);
  }
  if (!repository) {
    console.error("GITHUB_REPOSITORY is required (owner/repo).");
    process.exit(1);
  }

  const { owner, repo } = parseRepository(repository);
  const collectedAt = utcDateStamp();

  await mkdir(snapshotsDir, { recursive: true });

  const traffic = await fetchRepositoryTraffic({ owner, repo, token });

  const snapshot: DailyTrafficSnapshot = {
    collectedAt,
    owner,
    repo,
    ...traffic,
  };

  const snapshotPath = join(snapshotsDir, `${collectedAt}.json`);
  await writeJson(snapshotPath, snapshot);

  const previous = await readState(owner, repo);
  const state = mergeTrafficSnapshot(previous, snapshot);
  await writeJson(statePath, state);

  console.log(`Wrote ${snapshotPath}`);
  console.log(`Updated ${statePath} (collected ${collectedAt})`);
}

main().catch((error: unknown) => {
  if (error instanceof GitHubTrafficFetchError) {
    console.error(error.message);
    if (error.status === 403) {
      console.error(
        "Traffic API requires push access. Ensure the token can read repository traffic for this repo.",
      );
    }
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});
