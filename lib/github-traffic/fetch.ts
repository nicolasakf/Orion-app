import {
  popularPathsSchema,
  popularReferrersSchema,
  trafficSeriesSchema,
  type PopularPath,
  type PopularReferrer,
  type TrafficSeries,
} from "./schemas";
import type { TrafficSeriesSlice } from "./merge";

const GITHUB_API = "https://api.github.com";

export class GitHubTrafficFetchError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubTrafficFetchError";
  }
}

/**
 * Fetch and validate one GitHub repository traffic REST endpoint.
 */
export async function fetchGitHubTrafficJson<T>(
  url: string,
  token: string,
  schema: { parse: (data: unknown) => T },
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "orion-github-traffic-collector",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new GitHubTrafficFetchError(
      `GitHub API ${response.status} for ${url}: ${body.slice(0, 500)}`,
      response.status,
    );
  }

  return schema.parse(await response.json());
}

function toSeriesSlice(series: TrafficSeries, kind: "clones" | "views"): TrafficSeriesSlice {
  const buckets = kind === "clones" ? (series.clones ?? []) : (series.views ?? []);
  return {
    count: series.count,
    uniques: series.uniques,
    buckets,
  };
}

/**
 * Load all metrics shown on the repository Traffic insights page.
 */
export async function fetchRepositoryTraffic(params: {
  owner: string;
  repo: string;
  token: string;
}): Promise<{
  clones: { day: TrafficSeriesSlice; week: TrafficSeriesSlice };
  views: { day: TrafficSeriesSlice; week: TrafficSeriesSlice };
  popularPaths: PopularPath[];
  popularReferrers: PopularReferrer[];
}> {
  const { owner, repo, token } = params;
  const base = `${GITHUB_API}/repos/${owner}/${repo}/traffic`;

  const [clonesDay, clonesWeek, viewsDay, viewsWeek, popularPaths, popularReferrers] =
    await Promise.all([
      fetchGitHubTrafficJson(`${base}/clones?per=day`, token, trafficSeriesSchema),
      fetchGitHubTrafficJson(`${base}/clones?per=week`, token, trafficSeriesSchema),
      fetchGitHubTrafficJson(`${base}/views?per=day`, token, trafficSeriesSchema),
      fetchGitHubTrafficJson(`${base}/views?per=week`, token, trafficSeriesSchema),
      fetchGitHubTrafficJson(`${base}/popular/paths`, token, popularPathsSchema),
      fetchGitHubTrafficJson(`${base}/popular/referrers`, token, popularReferrersSchema),
    ]);

  return {
    clones: {
      day: toSeriesSlice(clonesDay, "clones"),
      week: toSeriesSlice(clonesWeek, "clones"),
    },
    views: {
      day: toSeriesSlice(viewsDay, "views"),
      week: toSeriesSlice(viewsWeek, "views"),
    },
    popularPaths,
    popularReferrers,
  };
}
