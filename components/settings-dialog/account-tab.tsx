"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { RoleCombobox } from "@/components/settings-dialog/role-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createOrionCloudSupabaseClient } from "@/lib/cloud/supabase-client";

interface AccountTabProps {
  onClose?: () => void;
  onSignedOut?: () => void | Promise<void>;
}

/** Account settings for the optional Orion Cloud publishing identity. */
export function AccountTab({ onClose, onSignedOut }: AccountTabProps) {
  const supabase = React.useMemo(() => createOrionCloudSupabaseClient(), []);
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [role, setRole] = React.useState("");
  const [oldPassword, setOldPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const debouncedSave = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Saves profile fields to the hosted Orion profile row. */
  const saveProfile = React.useCallback(
    async (updates: {
      first_name?: string;
      last_name?: string;
      job_role?: string;
    }) => {
      if (!supabase) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      setIsSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);
      setIsSaving(false);

      if (error) {
        toast.error(error.message);
      }
    },
    [supabase],
  );

  React.useEffect(() => {
    let cancelled = false;

    /** Loads the signed-in user's profile fields from Orion Cloud. */
    const loadProfile = async () => {
      if (!supabase) {
        setIsLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, job_role")
        .eq("id", user.id)
        .single();

      if (!cancelled && data) {
        setFirstName(
          typeof data.first_name === "string" ? data.first_name : "",
        );
        setLastName(typeof data.last_name === "string" ? data.last_name : "");
        setRole(typeof data.job_role === "string" ? data.job_role : "");
      }
      if (!cancelled) {
        setIsLoading(false);
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
      if (debouncedSave.current) {
        clearTimeout(debouncedSave.current);
      }
    };
  }, [supabase]);

  /** Debounces profile writes while preserving Orion-api account-tab behavior. */
  const scheduleSave = React.useCallback(
    (updates: { first_name?: string; last_name?: string; job_role?: string }) => {
      if (debouncedSave.current) clearTimeout(debouncedSave.current);
      debouncedSave.current = setTimeout(() => {
        void saveProfile(updates);
        debouncedSave.current = null;
      }, 500);
    },
    [saveProfile],
  );

  const handleFirstNameChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setFirstName(value);
      scheduleSave({ first_name: value || undefined });
    },
    [scheduleSave],
  );

  const handleLastNameChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setLastName(value);
      scheduleSave({ last_name: value || undefined });
    },
    [scheduleSave],
  );

  const handleRoleChange = React.useCallback(
    (value: string) => {
      setRole(value);
      scheduleSave({ job_role: value || undefined });
    },
    [scheduleSave],
  );

  const handleSignOut = React.useCallback(async () => {
    if (!supabase) {
      toast.error("Orion Cloud is not configured for this local app.");
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Signed out successfully");
    await onSignedOut?.();
    onClose?.();
  }, [onClose, onSignedOut, supabase]);

  /** Changes the password after verifying the user's current password. */
  const handleChangePassword = React.useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!supabase) {
        toast.error("Orion Cloud is not configured for this local app.");
        return;
      }
      if (!oldPassword.trim()) {
        toast.error("Please enter your current password");
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error("New passwords do not match");
        return;
      }
      if (newPassword.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        toast.error("Unable to verify identity");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPassword,
      });
      if (signInError) {
        toast.error("Current password is incorrect");
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Password updated successfully");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    [confirmPassword, newPassword, oldPassword, supabase],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-8 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-48 rounded bg-muted" />
          <div className="h-10 rounded bg-muted" />
          <div className="h-10 rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-6">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Account</h2>
          {isSaving ? (
            <span className="text-xs text-muted-foreground">Saving...</span>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={handleFirstNameChange}
              placeholder="Enter your first name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={handleLastNameChange}
              placeholder="Enter your last name"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Which of the following roles best describes you?</Label>
          <RoleCombobox value={role} onValueChange={handleRoleChange} />
          <p className="text-xs text-muted-foreground">
            Select from the list or type a custom role.
          </p>
        </div>
        <Button variant="outline" onClick={handleSignOut} className="w-fit">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>

      <Separator />

      <div className="space-y-6">
        <h2 className="text-lg font-semibold">Change password</h2>
        <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
          <div className="space-y-2">
            <Label htmlFor="oldPassword">Old password</Label>
            <Input
              id="oldPassword"
              type="password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              placeholder="Enter your current password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Enter your new password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm new password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm your new password"
            />
          </div>
          <Button type="submit">Update password</Button>
        </form>
      </div>
    </div>
  );
}
