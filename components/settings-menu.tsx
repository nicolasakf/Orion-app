"use client";

import {
  Download,
  Loader2,
  LogOut,
  Moon,
  RefreshCw,
  Scan,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";

import { CloudAuthDialog } from "@/components/cloud/cloud-auth-dialog";
import { ToolbarButton } from "@/components/common/toolbar-button";
import { AltOrOption, CmdOrCtrl } from "@/components/common/keyboard-icons";
import { SettingsDialog } from "@/components/settings-dialog/settings-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useOpenSettings } from "@/contexts/open-settings-context";
import { useCloudUser } from "@/hooks/use-cloud-user";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { useIsDesktopApp } from "@/hooks/use-platform";
import { createOrionCloudSupabaseClient } from "@/lib/cloud/supabase-client";
import { cn } from "@/lib/utils";
import { useOrionUpdate } from "@/components/update-provider";

const ORION_LOGO_SRC = {
  dark: "/assets/Orion%20Logo_White.svg",
  light: "/assets/Orion%20Logo_Black.svg",
} as const;

/** Extracts initials from email for avatar fallback (e.g. "john@example.com" -> "J"). */
function getInitialsFromEmail(email: string | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0];
  if (!local) return "?";
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  }
  return local.slice(0, 2).toUpperCase();
}

interface SettingsMenuProps extends ButtonProps {
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
}

const menuSwitchClassName =
  "h-4 w-8 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-4";

/** Focus mode button and theme toggle shown beside sign-in / sign-out in the account menu. */
function AccountMenuToggles({
  isFocusMode,
  onToggleFocusMode,
  isDarkTheme,
  onThemeToggle,
  showFocusMode = true,
}: {
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
  isDarkTheme: boolean;
  onThemeToggle: (checked: boolean) => void;
  showFocusMode?: boolean;
}) {
  return (
    <div className="ml-4 flex items-center gap-3">
      {showFocusMode ? (
        <ToolbarButton
          onClick={onToggleFocusMode}
          aria-pressed={isFocusMode}
          className={cn(
            isFocusMode && "bg-accent text-foreground hover:bg-accent",
          )}
          toolTipLabel={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
          toolTipShortcut={[[AltOrOption, "Z"]]}
        >
          <Scan className="h-4 w-4" />
        </ToolbarButton>
      ) : null}
      <div className="flex items-center gap-1.5">
        <Sun className="h-3.5 w-3.5 text-muted-foreground" />
        <Switch
          checked={isDarkTheme}
          onCheckedChange={onThemeToggle}
          className={menuSwitchClassName}
          aria-label={isDarkTheme ? "Switch to light theme" : "Switch to dark theme"}
        />
        <Moon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
    </div>
  );
}

export function SettingsMenu({
  isFocusMode,
  onToggleFocusMode,
  ...props
}: SettingsMenuProps) {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const isBusinessMode = effectiveSettings.appearance.experienceMode === "business";
  const { setTheme, resolvedTheme } = useTheme();
  const [authOpen, setAuthOpen] = useState(false);
  const { configured, user, loading, refresh } = useCloudUser();
  const { state: updateState, updateAvailable, checkForUpdates, performUpdate } =
    useOrionUpdate();
  const isDesktopApp = useIsDesktopApp();
  const {
    open: isSettingsDialogOpen,
    onOpenChange: setIsSettingsDialogOpen,
    initialTab,
    initialAgentSection,
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

  /** Signs the current cloud user out of optional Orion Cloud features. */
  const handleSignOut = async () => {
    const supabase = createOrionCloudSupabaseClient();
    if (!supabase) {
      toast.error("Orion Cloud is not configured for this local app.");
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }

    await refresh();
    toast.success("Signed out successfully");
  };

  const avatarUrl =
    user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture;
  const settingsTooltipShortcut = isDesktopApp
    ? [[CmdOrCtrl, ","]]
    : [[CmdOrCtrl, AltOrOption, ","]];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolbarButton
            variant="ghost"
            size="icon"
            className="relative h-8 w-8"
            toolTipLabel="Account & settings"
            toolTipShortcut={settingsTooltipShortcut}
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
            <span className="sr-only">Account & settings</span>
            {updateAvailable ? (
              <span
                aria-label="Orion update available"
                className="absolute right-0.5 top-0.5 size-2 rounded-full bg-blue-500 ring-2 ring-background"
              />
            ) : null}
          </ToolbarButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-fit">
          <DropdownMenuGroup>
            {loading ? (
              <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
            ) : user ? (
              <>
                <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={avatarUrl} alt={user.email} />
                      <AvatarFallback className="text-xs">
                        {getInitialsFromEmail(user.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">{user.email}</span>
                      <span className="text-muted-foreground">Orion Cloud</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <div className="corner-squircle flex items-center justify-between rounded-sm px-2 py-1 text-sm outline-none">
                  <Button
                    variant="ghost"
                    onClick={handleSignOut}
                    className="flex flex-1 items-center px-2"
                  >
                    <LogOut className="h-3 w-4" />
                    Sign Out
                  </Button>
                  <AccountMenuToggles
                    isFocusMode={isFocusMode}
                    onToggleFocusMode={onToggleFocusMode}
                    isDarkTheme={resolvedTheme === "dark"}
                    onThemeToggle={handleThemeToggle}
                    showFocusMode={!isBusinessMode}
                  />
                </div>
              </>
            ) : (
              <div className="corner-squircle flex items-center justify-between rounded-sm px-2 py-1 text-sm outline-none">
                <Button
                  variant="ghost"
                  onClick={() => setAuthOpen(true)}
                  className="flex flex-1 items-center px-2"
                >
                  <User className="h-3 w-4" />
                  Sign In
                </Button>
                <AccountMenuToggles
                  isFocusMode={isFocusMode}
                  onToggleFocusMode={onToggleFocusMode}
                  isDarkTheme={resolvedTheme === "dark"}
                  onThemeToggle={handleThemeToggle}
                  showFocusMode={!isBusinessMode}
                />
              </div>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {updateState.supported ? (
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={["checking", "downloading", "installing"].includes(updateState.status)}
                onSelect={() => {
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
                {updateState.status === "downloaded"
                  ? "Restart and update"
                  : updateState.status === "downloading"
                    ? `Downloading${updateState.progress === undefined ? "" : ` ${Math.round(updateState.progress)}%`}`
                    : updateState.status === "installing"
                      ? "Updating Orion..."
                      : updateState.status === "checking"
                        ? "Checking for updates..."
                        : updateState.status === "available"
                          ? `Update to ${updateState.latestVersion}`
                          : "Check for updates"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : null}
          {updateState.supported ? <DropdownMenuSeparator /> : null}
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setIsSettingsDialogOpen(true)}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <CloudAuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onAuthenticated={refresh}
      />
      <SettingsDialog
        open={isSettingsDialogOpen}
        onOpenChange={setIsSettingsDialogOpen}
        initialTab={initialTab}
        initialAgentSection={initialAgentSection}
      />
    </>
  );
}
