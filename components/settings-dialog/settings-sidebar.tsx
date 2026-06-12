"use client";

import * as React from "react";
import {
  Palette,
  Box,
  Key,
  FileJson,
  ExternalLink,
  Bot,
  BookOpen,
  User,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  AGENT_SETTINGS_SECTIONS,
  type AgentSettingsSection,
  type SettingsTab,
} from "@/components/settings-dialog/types";
import { ORION_USER_DOCS_URL } from "@/lib/constants/user-docs";
import { cn } from "@/lib/utils";

const SETTINGS_NAV_BASE: { id: SettingsTab; title: string; icon: React.ElementType }[] = [
  { id: "account", title: "Account", icon: User },
  { id: "appearance", title: "Appearance", icon: Palette },
  { id: "notebook", title: "Notebook", icon: BookOpen },
  { id: "agent", title: "Agent", icon: Bot },
  { id: "models", title: "Models", icon: Box },
  { id: "providers", title: "Providers", icon: Key },
  { id: "settings-file", title: "Settings JSON", icon: FileJson },
];

interface SettingsSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeTab: SettingsTab;
  agentSection: AgentSettingsSection;
  onTabChange: (tab: SettingsTab) => void;
  onAgentSectionChange: (section: AgentSettingsSection) => void;
  showAccountTab?: boolean;
}

/** Settings dialog sidebar with navigation items and agent subsections. */
export function SettingsSidebar({
  activeTab,
  agentSection,
  onTabChange,
  onAgentSectionChange,
  showAccountTab = false,
  className,
  ...props
}: SettingsSidebarProps) {
  const settingsNav = SETTINGS_NAV_BASE.filter((item) => {
    if (item.id === "account" && !showAccountTab) return false;
    return true;
  });

  return (
    <Sidebar
      /** In-dialog layout: avoid default sidebar `fixed` + `h-svh`, which overflows/clips inside `DialogContent`. */
      collapsible="none"
      variant="floating"
      className={cn(
        "corner-squircle min-h-0 shrink-0 overflow-hidden rounded-lg border border-sidebar-border shadow",
        className
      )}
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" disabled>
              <div className="flex flex-col gap-0.5 leading-none text-left">
                <span className="font-semibold">Settings</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-1">
            {settingsNav.map((item) => {
              const Icon = item.icon;
              const isAgentTab = item.id === "agent";
              const isActive = isAgentTab
                ? activeTab === "agent"
                : activeTab === item.id;

              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={isActive}
                    onClick={() => onTabChange(item.id)}
                    className="cursor-pointer"
                  >
                    <Icon className="h-4 w-4" />
                    {item.title}
                  </SidebarMenuButton>
                  {isAgentTab && activeTab === "agent" ? (
                    <SidebarMenuSub>
                      {AGENT_SETTINGS_SECTIONS.map((section) => (
                        <SidebarMenuSubItem key={section.id}>
                          <SidebarMenuSubButton
                            isActive={agentSection === section.id}
                            onClick={() => onAgentSectionChange(section.id)}
                            className="cursor-pointer"
                          >
                            {section.title}
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="cursor-pointer">
                <a
                  href={ORION_USER_DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Help
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
