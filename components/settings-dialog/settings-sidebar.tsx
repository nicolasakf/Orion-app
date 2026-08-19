"use client";

import * as React from "react";
import {
  Palette,
  Box,
  ChevronDown,
  ChevronRight,
  Key,
  Plug,
  FileJson,
  ExternalLink,
  Bot,
  BookOpen,
  User,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  UserRoundSearch,
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
import { useOpenSettings } from "@/contexts/open-settings-context";
import { dispatchInsertChatSkill } from "@/lib/chat/chat-composer-events";
import { ORION_USER_DOCS_URL } from "@/lib/constants/user-docs";
import { cn } from "@/lib/utils";
import { useOrionUpdate } from "@/components/update-provider";

const SETTINGS_NAV_BASE: { id: SettingsTab; title: string; icon: React.ElementType }[] = [
  { id: "account", title: "Account", icon: User },
  { id: "appearance", title: "Appearance", icon: Palette },
  { id: "personal-context", title: "Personal context", icon: UserRoundSearch },
  { id: "notebook", title: "Notebook", icon: BookOpen },
  { id: "agent", title: "Agent", icon: Bot },
  { id: "models", title: "Models", icon: Box },
  { id: "providers", title: "Providers", icon: Key },
  { id: "connections", title: "Connections", icon: Plug },
  { id: "settings-file", title: "Settings JSON", icon: FileJson },
];

interface SettingsSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeTab: SettingsTab;
  agentSection: AgentSettingsSection;
  onTabChange: (tab: SettingsTab) => void;
  onAgentSectionChange: (section: AgentSettingsSection) => void;
  showAccountTab?: boolean;
  businessMode?: boolean;
}

/** Settings dialog sidebar with navigation items and agent subsections. */
export function SettingsSidebar({
  activeTab,
  agentSection,
  onTabChange,
  onAgentSectionChange,
  showAccountTab = false,
  businessMode = false,
  className,
  ...props
}: SettingsSidebarProps) {
  const { onOpenChange } = useOpenSettings();
  const { state: updateState, updateAvailable, checkForUpdates, performUpdate } =
    useOrionUpdate();
  const isAdvancedTabActive = !["account", "appearance", "personal-context"].includes(activeTab);
  const [advancedOpen, setAdvancedOpen] = React.useState(isAdvancedTabActive);

  React.useEffect(() => {
    if (isAdvancedTabActive) {
      setAdvancedOpen(true);
    }
  }, [isAdvancedTabActive]);

  const visibleSettingsNav = SETTINGS_NAV_BASE.filter((item) => {
    if (item.id === "account" && !showAccountTab) return false;
    if (
      businessMode &&
      item.id !== "account" &&
      item.id !== "appearance" &&
      item.id !== "personal-context"
    ) {
      return false;
    }
    return true;
  });
  const advancedSettingsNav = SETTINGS_NAV_BASE.filter((item) => {
    if (
      item.id === "account" ||
      item.id === "appearance" ||
      item.id === "personal-context"
    ) return false;
    return true;
  });

  const handleAskOrion = React.useCallback(() => {
    onOpenChange(false);
    dispatchInsertChatSkill("orion-settings", undefined, { newChat: true });
  }, [onOpenChange]);

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
            {visibleSettingsNav.map((item) => {
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
            {businessMode ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  className="cursor-pointer"
                  onClick={() => setAdvancedOpen((open) => !open)}
                >
                  {advancedOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Advanced
                </SidebarMenuButton>
                {advancedOpen ? (
                  <SidebarMenuSub>
                    {advancedSettingsNav.map((item) => {
                      const Icon = item.icon;
                      const isAgentTab = item.id === "agent";
                      const isActive = isAgentTab
                        ? activeTab === "agent"
                        : activeTab === item.id;

                      return (
                        <SidebarMenuSubItem key={item.id}>
                          <SidebarMenuSubButton
                            isActive={isActive}
                            onClick={() => onTabChange(item.id)}
                            className="cursor-pointer"
                          >
                            <Icon className="h-4 w-4" />
                            {item.title}
                          </SidebarMenuSubButton>
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
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            {updateState.supported ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="cursor-pointer"
                  disabled={["checking", "downloading", "installing"].includes(updateState.status)}
                  onClick={() => {
                    if (updateAvailable) void performUpdate();
                    else void checkForUpdates(true);
                  }}
                >
                  {["checking", "downloading", "installing"].includes(updateState.status) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : updateAvailable ? (
                    <Download className="h-4 w-4" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span>
                    {updateState.status === "downloaded"
                      ? "Restart and update"
                      : updateState.status === "available"
                        ? `Update to ${updateState.latestVersion}`
                        : updateState.status === "downloading"
                          ? `Downloading${updateState.progress === undefined ? "" : ` ${Math.round(updateState.progress)}%`}`
                          : updateState.status === "installing"
                            ? "Updating Orion..."
                            : updateState.status === "checking"
                              ? "Checking for updates..."
                              : "Check for updates"}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
            <SidebarMenuItem>
              <SidebarMenuButton
                type="button"
                className="cursor-pointer"
                onClick={handleAskOrion}
              >
                <Sparkles className="h-4 w-4" />
                Ask Orion
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="cursor-pointer">
                <a
                  href={ORION_USER_DOCS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Docs
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
