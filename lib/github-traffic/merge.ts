import type { PopularPath, PopularReferrer, TrafficBucket } from "./schemas";

export const GITHUB_TRAFFIC_STATE_VERSION = 1 as const;

export type TrafficGranularity = "day" | "week";

export interface TrafficBucketRecord {
  count: number;
  uniques: number;
}

export interface RankedTrafficSnapshot<T> {
  collectedAt: string;
  items: T[];
}

export interface GitHubTrafficState {
  version: typeof GITHUB_TRAFFIC_STATE_VERSION;
  owner: string;
  repo: string;
  firstCollectedAt: string | null;
  lastCollectedAt: string | null;
  clones: Record<TrafficGranularity, Record<string, TrafficBucketRecord>>;
  views: Record<TrafficGranularity, Record<string, TrafficBucketRecord>>;
  popularPaths: RankedTrafficSnapshot<PopularPath>[];
  popularReferrers: RankedTrafficSnapshot<PopularReferrer>[];
}

export interface DailyTrafficSnapshot {
  collectedAt: string;
  owner: string;
  repo: string;
  clones: {
    day: TrafficSeriesSlice;
    week: TrafficSeriesSlice;
  };
  views: {
    day: TrafficSeriesSlice;
    week: TrafficSeriesSlice;
  };
  popularPaths: PopularPath[];
  popularReferrers: PopularReferrer[];
}

export interface TrafficSeriesSlice {
  count: number;
  uniques: number;
  buckets: TrafficBucket[];
}

/**
 * Empty persisted state for a repository before the first collection run.
 */
export function createEmptyTrafficState(owner: string, repo: string): GitHubTrafficState {
  return {
    version: GITHUB_TRAFFIC_STATE_VERSION,
    owner,
    repo,
    firstCollectedAt: null,
    lastCollectedAt: null,
    clones: { day: {}, week: {} },
    views: { day: {}, week: {} },
    popularPaths: [],
    popularReferrers: [],
  };
}

/**
 * Merge API buckets into long-term storage, keeping the highest counts seen per timestamp.
 */
export function mergeTrafficBuckets(
  existing: Record<string, TrafficBucketRecord>,
  incoming: TrafficBucket[],
): Record<string, TrafficBucketRecord> {
  const merged = { ...existing };
  for (const bucket of incoming) {
    const prev = merged[bucket.timestamp];
    if (
      !prev ||
      bucket.count > prev.count ||
      bucket.uniques > prev.uniques
    ) {
      merged[bucket.timestamp] = { count: bucket.count, uniques: bucket.uniques };
    }
  }
  return merged;
}

function upsertRankedSnapshot<T>(
  list: RankedTrafficSnapshot<T>[],
  collectedAt: string,
  items: T[],
): RankedTrafficSnapshot<T>[] {
  const withoutSameDay = list.filter((entry) => entry.collectedAt !== collectedAt);
  return [...withoutSameDay, { collectedAt, items }];
}

/**
 * Apply one daily API snapshot onto accumulated repository traffic state.
 */
export function mergeTrafficSnapshot(
  state: GitHubTrafficState,
  snapshot: DailyTrafficSnapshot,
): GitHubTrafficState {
  const collectedAt = snapshot.collectedAt;

  return {
    ...state,
    firstCollectedAt: state.firstCollectedAt ?? collectedAt,
    lastCollectedAt: collectedAt,
    clones: {
      day: mergeTrafficBuckets(state.clones.day, snapshot.clones.day.buckets),
      week: mergeTrafficBuckets(state.clones.week, snapshot.clones.week.buckets),
    },
    views: {
      day: mergeTrafficBuckets(state.views.day, snapshot.views.day.buckets),
      week: mergeTrafficBuckets(state.views.week, snapshot.views.week.buckets),
    },
    popularPaths: upsertRankedSnapshot(state.popularPaths, collectedAt, snapshot.popularPaths),
    popularReferrers: upsertRankedSnapshot(
      state.popularReferrers,
      collectedAt,
      snapshot.popularReferrers,
    ),
  };
}
