"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { RoleCombobox } from "@/components/settings-dialog/role-combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createOrionCloudSupabaseClient } from "@/lib/cloud/supabase-client";

interface CloudAuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "login" | "signup";
  onAuthenticated?: () => void | Promise<void>;
}

type AuthStep = "form" | "emailConfirmation" | "forgotPassword" | "resetEmailSent";

interface PendingProfile {
  first_name: string | null;
  last_name: string | null;
  job_role: string | null;
  timestamp: number;
}

/** Returns a readable message for Supabase auth failures. */
function getAuthErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Cloud sign-in failed.";
}

/** Stores signup profile fields until the user confirms their email and signs in. */
function storePendingProfile(profile: Omit<PendingProfile, "timestamp">): void {
  window.localStorage.setItem(
    "pendingProfile",
    JSON.stringify({
      ...profile,
      timestamp: Date.now(),
    }),
  );
}

/** Syncs deferred signup profile metadata after an authenticated session exists. */
async function processPendingProfile(
  supabase: NonNullable<ReturnType<typeof createOrionCloudSupabaseClient>>,
  userId: string,
): Promise<void> {
  const pendingProfile = window.localStorage.getItem("pendingProfile");
  if (!pendingProfile) return;

  try {
    const profile = JSON.parse(pendingProfile) as Partial<PendingProfile>;
    const timestamp =
      typeof profile.timestamp === "number" ? profile.timestamp : 0;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    if (Date.now() - timestamp >= oneWeekMs) {
      window.localStorage.removeItem("pendingProfile");
      return;
    }

    const updates: Record<string, string> = {};
    if (typeof profile.first_name === "string" && profile.first_name) {
      updates.first_name = profile.first_name;
    }
    if (typeof profile.last_name === "string" && profile.last_name) {
      updates.last_name = profile.last_name;
    }
    if (typeof profile.job_role === "string" && profile.job_role) {
      updates.job_role = profile.job_role;
    }

    if (Object.keys(updates).length === 0) {
      window.localStorage.removeItem("pendingProfile");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId);

    if (!error) {
      window.localStorage.removeItem("pendingProfile");
    }
  } catch (error) {
    console.warn("Failed to process pending Orion Cloud profile:", error);
    window.localStorage.removeItem("pendingProfile");
  }
}

/** Orion Cloud auth dialog, adapted from the hosted Orion login/signup flow. */
export function CloudAuthDialog({
  open,
  onOpenChange,
  defaultTab = "login",
  onAuthenticated,
}: CloudAuthDialogProps) {
  const supabase = React.useMemo(() => createOrionCloudSupabaseClient(), []);
  const [authMode, setAuthMode] = React.useState<"login" | "signup">(defaultTab);
  const [authStep, setAuthStep] = React.useState<AuthStep>("form");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [jobRole, setJobRole] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const isLogin = authMode === "login";

  React.useEffect(() => {
    if (!open) return;
    setAuthMode(defaultTab);
    setAuthStep("form");
    setIsLoading(false);
  }, [defaultTab, open]);

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      toast.error("Orion Cloud is not configured for this local app.");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (error) throw error;
      setAuthStep("resetEmailSent");
    } catch (error) {
      toast.error(getAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) {
      toast.error("Orion Cloud is not configured for this local app.");
      return;
    }

    if (!isLogin && !jobRole.trim()) {
      toast.error("Please select or type your job role");
      return;
    }

    setIsLoading(true);
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) {
          await processPendingProfile(supabase, data.user.id);
        }
        toast.success("Successfully logged in!");
        onOpenChange(false);
        await onAuthenticated?.();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              first_name: firstName.trim() || null,
              last_name: lastName.trim() || null,
              job_role: jobRole.trim() || null,
            },
          },
        });
        if (error) throw error;

        storePendingProfile({
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          job_role: jobRole.trim() || null,
        });
        toast.success("Signup complete. Confirm your email to continue.");
        setAuthStep("emailConfirmation");
      }
    } catch (error) {
      toast.error(getAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        {authStep === "emailConfirmation" ? (
          <>
            <DialogHeader>
              <DialogTitle>Confirm your email</DialogTitle>
              <DialogDescription>
                We sent a confirmation link to{" "}
                <span className="font-medium">{email}</span>. Confirm your
                email, then come back to sign in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  setAuthStep("form");
                  setAuthMode("login");
                }}
              >
                I&apos;ve already confirmed my email
              </Button>
            </div>
          </>
        ) : authStep === "forgotPassword" ? (
          <>
            <DialogHeader>
              <DialogTitle>Reset your password</DialogTitle>
              <DialogDescription>
                Enter your email and we&apos;ll send you a link to reset your
                password.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleForgotPassword} className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Send reset link
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setAuthStep("form")}
              >
                Back to sign in
              </Button>
            </form>
          </>
        ) : authStep === "resetEmailSent" ? (
          <>
            <DialogHeader>
              <DialogTitle>Check your email</DialogTitle>
              <DialogDescription>
                We sent a password reset link to{" "}
                <span className="font-medium">{email}</span>. Follow the link
                to set a new password.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setAuthStep("form");
                  setAuthMode("login");
                }}
              >
                Back to sign in
              </Button>
            </div>
          </>
        ) : (
          <>
            <Tabs
              value={authMode}
              onValueChange={(value) => setAuthMode(value as "login" | "signup")}
            >
              <TabsList className="mt-4 grid w-full grid-cols-2">
                <TabsTrigger value="login">I have an account</TabsTrigger>
                <TabsTrigger value="signup">
                  I don&apos;t have an account
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <DialogHeader>
              <DialogTitle>
                {isLogin ? "Welcome Back!" : "Create Account"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAuth} className="space-y-4 py-4">
              {!isLogin ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="first-name">First Name</Label>
                      <Input
                        id="first-name"
                        type="text"
                        value={firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                        placeholder="John"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last-name">Last Name</Label>
                      <Input
                        id="last-name"
                        type="text"
                        value={lastName}
                        onChange={(event) => setLastName(event.target.value)}
                        placeholder="Doe"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Which of the following roles best describes you?
                    </Label>
                    <RoleCombobox value={jobRole} onValueChange={setJobRole} />
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {isLogin ? (
                    <button
                      type="button"
                      className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => setAuthStep("forgotPassword")}
                    >
                      Forgot password?
                    </button>
                  ) : null}
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {isLogin ? "Sign In" : "Sign Up"}
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading || !supabase}
                onClick={async () => {
                  if (!supabase) {
                    toast.error("Orion Cloud is not configured for this local app.");
                    return;
                  }
                  setIsLoading(true);
                  try {
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: "google",
                      options: {
                        redirectTo: window.location.href,
                      },
                    });
                    if (error) throw error;
                  } catch (error) {
                    toast.error(getAuthErrorMessage(error));
                    setIsLoading(false);
                  }
                }}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg
                    className="mr-2 h-4 w-4"
                    aria-hidden="true"
                    focusable="false"
                    data-prefix="fab"
                    data-icon="google"
                    role="img"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 488 512"
                  >
                    <path
                      fill="currentColor"
                      d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
                    />
                  </svg>
                )}
                Google
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
