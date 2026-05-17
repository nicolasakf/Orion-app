export type DiscoverableSubagentInfo = {
  name: string;
  label?: string;
  description: string;
  options?: { disableModelInvocation?: boolean };
};

export function isSubagentModelInvocable(subagent: DiscoverableSubagentInfo): boolean {
  return subagent.options?.disableModelInvocation !== true;
}

export function filterDiscoverableSubagents<T extends DiscoverableSubagentInfo>(
  subagents: T[]
): T[] {
  return subagents.filter(isSubagentModelInvocable);
}
