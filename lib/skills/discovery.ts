export type ModelInvocableSkillInfo = {
  name: string;
  description: string;
  disableModelInvocation?: boolean;
};

/** Returns true when a skill may be advertised for model-chosen loading. */
export function isSkillModelInvocable(skill: ModelInvocableSkillInfo): boolean {
  return skill.disableModelInvocation !== true;
}

/** Filters skills that should be hidden from automatic model invocation. */
export function filterModelInvocableSkills<T extends ModelInvocableSkillInfo>(skills: T[]): T[] {
  return skills.filter(isSkillModelInvocable);
}
