export type SettingsTab =
  | "appearance"
  | "notebook"
  | "agent"
  | "models"
  | "providers"
  | "settings-file";

/** Subsections shown in the sidebar when the Agent tab is active. */
export type AgentSettingsSection =
  | "communication"
  | "modes"
  | "context"
  | "tool-output"
  | "terminal"
  | "search"
  | "filesystem"
  | "web";

export const DEFAULT_AGENT_SETTINGS_SECTION: AgentSettingsSection = "communication";

export const AGENT_SETTINGS_SECTIONS: {
  id: AgentSettingsSection;
  title: string;
}[] = [
  { id: "communication", title: "Communication" },
  { id: "modes", title: "Interaction modes" },
  { id: "context", title: "Context" },
  { id: "tool-output", title: "Tool output" },
  { id: "terminal", title: "Terminal" },
  { id: "search", title: "Search" },
  { id: "filesystem", title: "Filesystem" },
  { id: "web", title: "Web" },
];
