"use client";

import * as React from "react";
import { Palette, Box, Key, FileJson, ExternalLink } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { SettingsTab } from "@/components/settings-dialog/types";
import { ORION_USER_DOCS_URL } from "@/lib/constants/user-docs";
import { cn } from "@/lib/utils";

const SETTINGS_NAV_BASE: { id: SettingsTab; title: string; icon: React.ElementType }[] = [
  { id: "appearance", title: "Appearance", icon: Palette },
  { id: "models", title: "Models", icon: Box },
  { id: "providers", title: "Providers", icon: Key },
  { id: "settings-file", title: "Settings JSON", icon: FileJson },
];

interface SettingsSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

/** Settings dialog sidebar with navigation items. */
export function SettingsSidebar({
  activeTab,
  onTabChange,
  className,
  ...props
}: SettingsSidebarProps) {
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
            {SETTINGS_NAV_BASE.map((item) => {
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeTab === item.id}
                    onClick={() => onTabChange(item.id)}
                    className="cursor-pointer"
                  >
                    <Icon className="h-4 w-4" />
                    {item.title}
                  </SidebarMenuButton>
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
