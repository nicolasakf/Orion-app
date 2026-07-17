/**
 * Preserves the current object identity when a proposed shallow state object
 * contains the same keys and values, allowing React to bail out of rerenders.
 */
export function retainShallowEqualState<T extends object>(
  current: T,
  next: T,
): T {
  const currentKeys = Object.keys(current) as Array<keyof T>;
  const nextKeys = Object.keys(next) as Array<keyof T>;
  if (currentKeys.length !== nextKeys.length) return next;

  return nextKeys.every((key) => current[key] === next[key]) ? current : next;
}
