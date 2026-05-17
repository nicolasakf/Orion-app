"use client";

import { Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { ToolbarButton } from "@/components/common/toolbar-button";
import { AltOrOption, CmdOrCtrl } from "@/components/common/keyboard-icons";
import { SettingsDialog } from "@/components/settings-dialog/settings-dialog";
import { ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useOpenSettings } from "@/contexts/open-settings-context";
import { useOrionSettings } from "@/hooks/use-orion-settings";

const ORION_LOGO_SRC = {
  dark: "/assets/Orion%20Logo_White.svg",
  light: "/assets/Orion%20Logo_Black.svg",
} as const;

export function SettingsMenu(props: ButtonProps) {
  const { setUserSettings } = useOrionSettings();
  const { setTheme, resolvedTheme } = useTheme();
  const {
    open: isSettingsDialogOpen,
    onOpenChange: setIsSettingsDialogOpen,
    initialTab,
  } = useOpenSettings();

  const handleThemeToggle = (checked: boolean) => {
    const nextTheme = checked ? "dark" : "light";
    setTheme(nextTheme);
    void setUserSettings((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        theme: nextTheme,
      },
    }));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolbarButton
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            toolTipLabel="Settings"
            toolTipShortcut={[[CmdOrCtrl, AltOrOption, ","]]}
            {...props}
          >
            <img
              src={ORION_LOGO_SRC.light}
              alt=""
              className="h-6 w-6 object-contain dark:hidden"
              draggable={false}
            />
            <img
              src={ORION_LOGO_SRC.dark}
              alt=""
              className="hidden h-6 w-6 object-contain dark:block"
              draggable={false}
            />
            <span className="sr-only">Settings</span>
          </ToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-fit">
          <DropdownMenuGroup>
            <div className="corner-squircle flex items-center justify-between rounded-sm px-2 py-1 text-sm outline-none">
              <DropdownMenuItem
                onClick={() => setIsSettingsDialogOpen(true)}
                className="flex flex-1 items-center px-2"
              >
                <Settings className="h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <div className="flex items-center gap-1.5 ml-4">
                <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                <Switch
                  checked={resolvedTheme === "dark"}
                  onCheckedChange={handleThemeToggle}
                  className="h-4 w-8 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-4"
                />
                <Moon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsDialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
        initialTab={initialTab}
      />
    </>
  );
}
