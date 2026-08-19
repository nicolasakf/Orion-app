import {
  BUSINESS_TOOL_CATEGORIES,
  DEPRECATED_BUSINESS_TOOL_IDS,
  countAnsweredCategories,
  findBusinessTool,
  type BusinessStackSelection,
  type BusinessTool,
} from "@/lib/onboarding/business-tools";

/**
 * Turns the onboarding stack answers into the `ORION.md` text the agent reads on
 * its first session, plus the compact summary handed to the chat interviewer.
 *
 * Nothing here is a credential. The picker records only which products a company
 * uses; the how-to-connect text names auth *shapes* and documentation entry
 * points so the agent can ask the right question instead of guessing.
 */

/** Heading the draft generator must reuse so regenerated files stay stable. */
export const BUSINESS_STACK_HEADING = "## Tools we use and how to reach them";

/** Heading for the standing procedure, kept separate so users can edit either. */
export const CONNECTION_PLAYBOOK_HEADING = "## Connecting to a tool";

/**
 * The one place the connection procedure is written down.
 *
 * It lives in `ORION.md` rather than the agent system prompt because it is only
 * relevant to Business users who answered the stack questions, and because the
 * user must be able to read and edit the rules Orion follows with their systems.
 */
export const BUSINESS_TOOL_CONNECTION_PLAYBOOK = `${CONNECTION_PLAYBOOK_HEADING}

These are the standing rules for reaching any system listed above. They apply
every session, not just the first one.

**Local files on this machine:** Orion always has read access to files under the
Jupyter root (typically the user's home directory). The user picks a workspace
when they start working. Do not treat local folders as an external system to
connect or ask the user to select them during onboarding.

1. **Do not connect anything unprompted.** Ask which system to start with, and
   confirm before the first call that reaches outside this machine.
2. **Try routes in this order, and never invent one that is not on this list.**
   A stored connection Orion already holds (check with the \`connections\` tool,
   action \`list\`) → an existing skill for the tool → asking the user to add the
   connection (\`connections\` tool, action \`request\`, which opens Orion's
   Connections settings for them) → the vendor's documented API or SDK driven
   from a notebook cell using that connection → a file the user exports and drops
   in a local folder → asking the user to run the step themselves. If every route
   is exhausted, say so plainly; do not describe a button or panel you have not
   seen in this list.
3. **Never accept a secret in chat, in a notebook cell, or in this file.**
   Passwords, API keys, tokens, and private keys belong in Orion's Connections
   settings or the user's own secret manager. Notebook code reads them through
   \`orion_ui.connections.get("<id>")\`, which resolves the secret in-process and
   never prints it. If a secret appears in conversation, say so and ask the user
   to rotate it.
4. **Collect the non-secret specifics first.** Most connections fail for want of
   an account identifier, site subdomain, tenant, region, warehouse, base id, or
   property id — not for want of a token. Ask for those explicitly.
5. **Verify with the smallest possible read** (one record, one row, one channel)
   and report exactly what was reachable before doing real work.
6. **Prefer read-only scopes.** Anything that writes, sends, posts, or deletes
   needs explicit per-action confirmation from the user.
7. **Write down what worked.** As soon as a connection succeeds, create a
   user-level skill at \`.agents/skills/<tool-id>/SKILL.md\` describing the
   working recipe: which route worked, the exact endpoints or queries used, the
   identifiers needed, the field names that matter, and the traps hit along the
   way. Reference the credential by the name it has in settings — never copy its
   value. Update that skill whenever the recipe changes, so the next session
   starts from a working procedure instead of rediscovering it.
8. **When a route is blocked, record that too**, in the same skill, with what
   the user would need to change (an admin grant, a plan upgrade, a VPN) so the
   dead end is not retried every session.`;

/** Human-readable label for each authentication shape. */
const AUTH_LABELS: Record<BusinessTool["auth"], string> = {
  oauth: "OAuth app / user consent",
  "api-key": "API key or token from admin settings",
  sql: "database credentials + connection details",
  "file-export": "manual export",
  "local-file": "local file or folder",
};

/** Returns persisted tool ids that should still appear in memory output. */
function activeToolIds(toolIds: readonly string[]): string[] {
  const deprecated = new Set<string>(DEPRECATED_BUSINESS_TOOL_IDS);
  return toolIds.filter((id) => !deprecated.has(id));
}

/** Renders one tool as a Markdown bullet with its access hints. */
function renderToolLine(tool: BusinessTool): string {
  const details: string[] = [AUTH_LABELS[tool.auth]];
  if (tool.site) details.push(tool.site);
  if (tool.docs) details.push(`docs: ${tool.docs}`);
  const suffix = tool.note ? ` ${tool.note}` : "";
  return `- **${tool.name}** — ${details.join("; ")}.${suffix}`;
}

/**
 * Builds the `ORION.md` section listing the user's stack.
 *
 * Returns an empty string when nothing was answered, so callers can append the
 * result unconditionally.
 */
export function buildBusinessStackMemorySection(
  selection: BusinessStackSelection,
): string {
  if (countAnsweredCategories(selection) === 0) return "";

  const blocks: string[] = [BUSINESS_STACK_HEADING];
  const unrecognized: string[] = [];

  for (const category of BUSINESS_TOOL_CATEGORIES) {
    const answer = selection.categories[category.id];
    if (!answer) continue;

    const tools = activeToolIds(answer.toolIds)
      .map((id) => findBusinessTool(id))
      .filter((tool): tool is BusinessTool => tool !== undefined);
    unrecognized.push(
      ...activeToolIds(answer.toolIds).filter((id) => findBusinessTool(id) === undefined),
    );

    if (tools.length === 0 && answer.customTools.length === 0) {
      if (answer.none) {
        blocks.push(`### ${category.label}\n- None. (${category.noneLabel}.)`);
      }
      continue;
    }

    const lines = tools.map(renderToolLine);
    for (const custom of answer.customTools) {
      lines.push(
        `- **${custom}** — named by the user; not in Orion's catalog. Ask how they access it before assuming an API exists.`,
      );
    }
    blocks.push(`### ${category.label}\n${lines.join("\n")}`);
  }

  if (unrecognized.length > 0) {
    blocks.push(
      `### Unrecognized selections\n- ${unrecognized.join(", ")} (recorded during onboarding; ask the user what these are).`,
    );
  }

  return blocks.join("\n\n");
}

/**
 * Builds the compact summary sent into the chat interview.
 *
 * Keeping it terse matters: it is prepended to every interview turn, and its
 * only job is to stop the interviewer from re-asking questions the picker
 * already answered.
 */
export function buildBusinessStackInterviewSummary(
  selection: BusinessStackSelection,
): string {
  if (countAnsweredCategories(selection) === 0) return "";

  const lines: string[] = [];
  for (const category of BUSINESS_TOOL_CATEGORIES) {
    const answer = selection.categories[category.id];
    if (!answer) continue;

    const names = [
      ...activeToolIds(answer.toolIds).map((id) => findBusinessTool(id)?.name ?? id),
      ...answer.customTools,
    ];
    if (names.length > 0) {
      lines.push(`- ${category.label}: ${names.join(", ")}`);
    } else if (answer.none) {
      lines.push(`- ${category.label}: none`);
    }
  }

  const unanswered = BUSINESS_TOOL_CATEGORIES.filter(
    (category) => !selection.categories[category.id],
  ).map((category) => category.label);

  const parts = [
    "The user already answered Orion's structured stack questions by selecting tools. Do not ask about these again:",
    lines.join("\n"),
  ];
  if (unanswered.length > 0) {
    parts.push(`They skipped these categories: ${unanswered.join(", ")}.`);
  }
  return parts.join("\n\n");
}
