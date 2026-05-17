/** Returns true for skill definition files such as `.orion/skills/foo/SKILL.md`. */
export function isSkillDefinitionPath(path: string | null | undefined): boolean {
  if (!path) return false;

  const segments = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (segments.length < 3) return false;

  const fileName = segments[segments.length - 1];
  const skillsSegment = segments[segments.length - 3];
  return fileName === "SKILL.md" && skillsSegment === "skills";
}
