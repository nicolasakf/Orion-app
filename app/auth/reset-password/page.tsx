"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrionCloudSupabaseClient } from "@/lib/cloud/supabase-client";

/** Password recovery page for Orion Cloud accounts used by publish features. */
export default function ResetPasswordPage() {
  const supabase = React.useMemo(() => createOrionCloudSupabaseClient(), []);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isDone, setIsDone] = React.useState(false);

  /** Validates inputs and updates the active Supabase recovery session password. */
  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!supabase) {
      toast.error("Orion Cloud is not configured for this local app.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setIsDone(true);
      toast.success("Password updated successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password reset failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {isDone ? (
          <>
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-semibold">Password updated</h1>
              <p className="text-sm text-muted-foreground">
                Your password has been changed. You can now sign in with your
                new password.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="/">Go to home</Link>
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-2 text-center">
              <h1 className="text-2xl font-semibold">Set new password</h1>
              <p className="text-sm text-muted-foreground">
                Enter a new password for your account.
              </p>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Update password
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
