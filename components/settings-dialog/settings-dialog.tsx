"use client";

import * as React from "react";

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
import { AppearanceTab } from "@/components/settings-dialog/appearance-tab";
import { ModelsTab } from "@/components/settings-dialog/models-tab";
import { ProvidersTab } from "@/components/settings-dialog/providers-tab";
import { SettingsSidebar } from "@/components/settings-dialog/settings-sidebar";
import { StorageTab } from "@/components/settings-dialog/storage-tab";
import type { SettingsTab } from "@/components/settings-dialog/types";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tab to show when dialog opens. */
  initialTab?: SettingsTab | null;
}

/** Settings dialog with local OSS configuration tabs. */
export function SettingsDialog({
  open,
  onOpenChange,
  initialTab,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("providers");

  React.useEffect(() => {
    if (open && initialTab) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  const renderTabContent = () => {
    switch (activeTab) {
      case "appearance":
        return <AppearanceTab />;
      case "models":
        return <ModelsTab />;
      case "providers":
        return <ProvidersTab />;
      case "storage":
        return <StorageTab />;
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
        <SidebarProvider
          className="flex-1 min-h-0 gap-3 p-3"
          style={
            {
              "--sidebar-width": "14rem",
            } as React.CSSProperties
          }
        >
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <SidebarInset className="min-h-0 flex-1 overflow-auto scrollbar-hide">
            {renderTabContent()}
          </SidebarInset>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
