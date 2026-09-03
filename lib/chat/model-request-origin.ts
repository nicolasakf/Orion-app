const CLIENT_OWNED_MODEL_REQUEST_ORIGINS = new Set([
  "user",
  "goal_evaluation",
  "goal_worker",
]);

/** Returns whether a request origin owns one stable client-generated request ID. */
export function usesClientModelRequestId(origin: string): boolean {
  return CLIENT_OWNED_MODEL_REQUEST_ORIGINS.has(origin);
}
