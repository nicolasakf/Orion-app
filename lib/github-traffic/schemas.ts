import { z } from "zod";

/** One day or week bucket from clones/views traffic endpoints. */
export const trafficBucketSchema = z.object({
  timestamp: z.string(),
  count: z.number().int().nonnegative(),
  uniques: z.number().int().nonnegative(),
});

/** Response from GET .../traffic/clones or .../traffic/views. */
export const trafficSeriesSchema = z.object({
  count: z.number().int().nonnegative(),
  uniques: z.number().int().nonnegative(),
  clones: z.array(trafficBucketSchema).optional(),
  views: z.array(trafficBucketSchema).optional(),
});

/** Response from GET .../traffic/popular/paths. */
export const popularPathSchema = z.object({
  path: z.string(),
  title: z.string(),
  count: z.number().int().nonnegative(),
  uniques: z.number().int().nonnegative(),
});

export const popularPathsSchema = z.array(popularPathSchema);

/** Response from GET .../traffic/popular/referrers. */
export const popularReferrerSchema = z.object({
  referrer: z.string(),
  count: z.number().int().nonnegative(),
  uniques: z.number().int().nonnegative(),
});

export const popularReferrersSchema = z.array(popularReferrerSchema);

export type TrafficBucket = z.infer<typeof trafficBucketSchema>;
export type TrafficSeries = z.infer<typeof trafficSeriesSchema>;
export type PopularPath = z.infer<typeof popularPathSchema>;
export type PopularReferrer = z.infer<typeof popularReferrerSchema>;
