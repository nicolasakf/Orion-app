"use client";

import { AgentAdvancedSection } from "@/components/settings-dialog/agent-advanced-section";
import { AgentCommunicationSection } from "@/components/settings-dialog/agent-communication-section";
import { AgentInteractionModesSection } from "@/components/settings-dialog/interaction-modes-tab";
import type { AgentSettingsSection } from "@/components/settings-dialog/types";

interface AgentTabProps {
  section: AgentSettingsSection;
}

/** Agent tab content router for sidebar subsections. */
export function AgentTab({ section }: AgentTabProps) {
  switch (section) {
    case "communication":
      return <AgentCommunicationSection />;
    case "modes":
      return <AgentInteractionModesSection />;
    case "context":
    case "tool-execution":
    case "terminal":
    case "filesystem":
    case "web":
      return <AgentAdvancedSection section={section} />;
    default:
      return <AgentCommunicationSection />;
  }
}
