"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AccountTab } from "@/components/settings-dialog/account-tab";
import { AgentTab } from "@/components/settings-dialog/agent-tab";
import { AppearanceTab } from "@/components/settings-dialog/appearance-tab";
import { ModelsTab } from "@/components/settings-dialog/models-tab";
import { NotebookTab } from "@/components/settings-dialog/notebook-tab";
import { ProvidersTab } from "@/components/settings-dialog/providers-tab";
import { SettingsFileTab } from "@/components/settings-dialog/settings-file-tab";
import { SettingsSidebar } from "@/components/settings-dialog/settings-sidebar";
import {
  DEFAULT_AGENT_SETTINGS_SECTION,
  type AgentSettingsSection,
  type SettingsTab,
} from "@/components/settings-dialog/types";
import { useSettingsContext } from "@/components/settings/settings-provider";
import { useOpenSettings } from "@/contexts/open-settings-context";
import { useCloudUser } from "@/hooks/use-cloud-user";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tab to show when dialog opens. */
  initialTab?: SettingsTab | null;
  /** Agent subsection to show when opening the Agent tab. */
  initialAgentSection?: AgentSettingsSection | null;
}

/** Settings dialog with local OSS configuration tabs. */
export function SettingsDialog({
  open,
  onOpenChange,
  initialTab,
  initialAgentSection,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("providers");
  const [agentSection, setAgentSection] = React.useState<AgentSettingsSection>(
    DEFAULT_AGENT_SETTINGS_SECTION
  );
  const { errorMessage, reloadUserSettings, userSettingsLoadStatus } =
    useSettingsContext();
  const { openUserSettingsFile, onOpenChange: setSettingsOpen } = useOpenSettings();
  const { user, refresh } = useCloudUser();
  const showAccountTab = Boolean(user);
  const settingsLoadFailed =
    userSettingsLoadStatus === "failed" && errorMessage;

  React.useEffect(() => {
    if (open && initialTab) {
      if (initialTab === "settings-file") {
        openUserSettingsFile();
        setSettingsOpen(false);
        return;
      }
      setActiveTab(
        initialTab === "account" && !showAccountTab ? "providers" : initialTab,
      );
      if (initialTab === "agent") {
        setAgentSection(initialAgentSection ?? DEFAULT_AGENT_SETTINGS_SECTION);
      }
    }
  }, [
    open,
    initialTab,
    initialAgentSection,
    openUserSettingsFile,
    setSettingsOpen,
    showAccountTab,
  ]);

  React.useEffect(() => {
    if (showAccountTab || activeTab !== "account") return;
    setActiveTab("providers");
  }, [activeTab, showAccountTab]);

  const handleTabChange = React.useCallback(
    (tab: SettingsTab) => {
      if (tab === "settings-file") {
        openUserSettingsFile();
        setSettingsOpen(false);
        return;
      }
      if (tab === "account" && !showAccountTab) {
        setActiveTab("providers");
        return;
      }
      setActiveTab(tab);
    },
    [openUserSettingsFile, setSettingsOpen, showAccountTab],
  );

  const handleAgentSectionChange = React.useCallback(
    (section: AgentSettingsSection) => {
      setActiveTab("agent");
      setAgentSection(section);
    },
    [],
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "account":
        return (
          <AccountTab
            onClose={() => onOpenChange(false)}
            onSignedOut={refresh}
          />
        );
      case "appearance":
        return <AppearanceTab />;
      case "notebook":
        return <NotebookTab />;
      case "agent":
        return <AgentTab section={agentSection} />;
      case "models":
        return <ModelsTab />;
      case "providers":
        return <ProvidersTab />;
      case "settings-file":
        return <SettingsFileTab />;
      default:
        return <ProvidersTab />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl w-[90vw] h-[85vh] p-0 gap-0 overflow-hidden flex flex-col"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        {settingsLoadFailed ? (
          <Alert variant="destructive" className="m-3 mb-0 w-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <AlertTitle>Settings failed to load</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void reloadUserSettings();
                }}
                className="shrink-0"
              >
                <RefreshCw className="size-4" />
                Retry
              </Button>
            </div>
          </Alert>
        ) : null}
        <TooltipProvider delayDuration={200}>
          <SidebarProvider
            className="flex-1 min-h-0 gap-3 p-3"
            style={
              {
                "--sidebar-width": "15rem",
              } as React.CSSProperties
            }
          >
            <SettingsSidebar
              activeTab={activeTab}
              agentSection={agentSection}
              onTabChange={handleTabChange}
              onAgentSectionChange={handleAgentSectionChange}
              showAccountTab={showAccountTab}
            />
            <SidebarInset className="min-h-0 flex-1 overflow-auto scrollbar-hide">
              {renderTabContent()}
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
