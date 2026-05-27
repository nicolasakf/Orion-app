"use client";

import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FolderOpen,
  Info,
  Server,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ORION_USER_DOCS_CONNECT_JUPYTER_URL,
} from "@/lib/constants/user-docs";

const JUPYTER_INSTALL_URL =
  "https://jupyter-server.readthedocs.io/en/latest/users/installation.html";

interface WelcomeInstructionsCardProps {
  /** Step 1 complete — Jupyter / kernel connected. */
  jupyterConnected: boolean;
  /** Step 2 complete — a workspace folder is open in Files. */
  workspaceOpen: boolean;
  onConnectServer?: () => void;
}

/**
 * Two-step onboarding in the empty editor. Each step shows a checkmark when
 * done; the card is dismissed only when both are complete.
 */
export function WelcomeInstructionsCard({
  jupyterConnected,
  workspaceOpen,
  onConnectServer,
}: WelcomeInstructionsCardProps) {
  const [installExpanded, setInstallExpanded] = useState(false);
  const [cmdCopied, setCmdCopied] = useState(false);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText("jupyter server --ServerApp.allow_origin='*'");
    setCmdCopied(true);
    setTimeout(() => setCmdCopied(false), 2000);
  };

  return (
    <div className="flex h-full items-center justify-center bg-sidebar px-6 py-10">
      <Card className="w-full max-w-3xl border-border/60 shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="text-2xl">Get started</CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-6">
            Connect to a Jupyter server, then open a workspace folder to browse
            files and run notebooks.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Step 1 — Jupyter */}
          <section
            className={cn(
              "corner-squircle rounded-md border p-5",
              jupyterConnected
                ? "border-green-500/25 bg-green-500/5"
                : "border-border/60 bg-muted/20"
            )}
          >
            <div className="flex gap-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  jupyterConnected
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : "bg-primary/10 text-primary"
                )}
              >
                {jupyterConnected ? (
                  <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                ) : (
                  <span aria-hidden>1</span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Server
                      className={cn(
                        "h-4 w-4",
                        jupyterConnected
                          ? "text-green-600 dark:text-green-400"
                          : "text-primary"
                      )}
                    />
                    <h2 className="text-base font-semibold">
                      Connect to a Jupyter server
                    </h2>
                  </div>
                  {jupyterConnected ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      You&apos;re connected. Continue with step 2 when you&apos;re
                      ready.
                    </p>
                  ) : (
                    <p className="text-sm leading-6 text-muted-foreground">
                      Orion needs a Jupyter server connection to run notebooks
                      and terminal commands.
                    </p>
                  )}
                </div>

                {!jupyterConnected && (
                  <div className="space-y-4">
                    <div className="corner-squircle space-y-4 rounded-lg border border-border/60 bg-background/80 p-4">
                      <ol className="space-y-3 text-sm leading-6 text-muted-foreground">
                        <li>1. Open a terminal.</li>
                        <li className="flex items-center gap-2 flex-wrap">
                          2. Run{" "}
                          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                            jupyter server --ServerApp.allow_origin=&apos;*&apos;
                          </code>
                          <button
                            type="button"
                            onClick={handleCopyCommand}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            {cmdCopied ? (
                              <Check className="h-3 w-3 text-green-500" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {cmdCopied ? "Copied" : "Copy"}
                          </button>
                        </li>
                        <li>
                          3. Copy the URL with the token from the terminal
                          output.
                        </li>
                      </ol>

                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Example URL
                        </p>
                        <div className="corner-squircle overflow-x-auto rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-xs text-foreground">
                          http://127.0.0.1:8888/?token=0123456789abcdef
                        </div>
                      </div>

                      <ol className="space-y-3 text-sm leading-6 text-muted-foreground" start={4}>
                        <li>
                          4. Click the{" "}
                          {onConnectServer ? (
                            <button
                              type="button"
                              onClick={onConnectServer}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              kernel selector
                            </button>
                          ) : (
                            "kernel selector"
                          )}{" "}
                          in the toolbar and paste the URL to connect.
                        </li>
                      </ol>
                    </div>

                    <Collapsible
                      open={installExpanded}
                      onOpenChange={setInstallExpanded}
                    >
                      <div className="corner-squircle rounded-lg border border-blue-500/40 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10">
                        <CollapsibleTrigger className="corner-squircle flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-blue-800 dark:text-blue-300 transition-colors rounded-lg">
                          {installExpanded ? (
                            <>
                              <ChevronDown className="h-4 w-4 shrink-0 text-blue-600/70 dark:text-blue-300/50" />
                              <Info className="h-4 w-4 shrink-0 text-blue-600/70 dark:text-blue-300/50" />
                            </>
                          ) : (
                            <>
                              <ChevronRight className="h-4 w-4 shrink-0 text-blue-600/70 dark:text-blue-300/50" />
                              <Info className="h-4 w-4 shrink-0 text-blue-600/70 dark:text-blue-300/50" />
                            </>
                          )}
                          Don&apos;t have Jupyter installed?
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="space-y-3 px-4 pb-4 pt-0">
                            <p className="text-sm leading-6 text-blue-800/90 dark:text-blue-300/80">
                              Run{" "}
                              <code className="rounded bg-blue-100 dark:bg-blue-300/10 px-1.5 py-0.5 text-xs text-blue-800 dark:text-blue-300">
                                pip install jupyter_server
                              </code>{" "}
                              in your terminal.
                            </p>
                            <a
                              href={JUPYTER_INSTALL_URL}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-300/80 underline-offset-4 hover:underline"
                            >
                              More installation options
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <a
                              href={ORION_USER_DOCS_CONNECT_JUPYTER_URL}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-300/80 underline-offset-4 hover:underline"
                            >
                              Connect Orion to Jupyter (help)
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Step 2 — Workspace */}
          <section
            className={cn(
              "corner-squircle rounded-md border p-5",
              workspaceOpen
                ? "border-green-500/25 bg-green-500/5"
                : "border-border/60 bg-muted/20"
            )}
          >
            <div className="flex gap-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  workspaceOpen
                    ? "bg-green-500/15 text-green-600 dark:text-green-400"
                    : "bg-primary/10 text-primary"
                )}
              >
                {workspaceOpen ? (
                  <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                ) : (
                  <span aria-hidden>2</span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <FolderOpen
                    className={cn(
                      "h-4 w-4",
                      workspaceOpen
                        ? "text-green-600 dark:text-green-400"
                        : "text-primary"
                    )}
                  />
                  <h2 className="text-base font-semibold">Open a workspace folder</h2>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {workspaceOpen
                    ? "Workspace is open. You can browse files in the Files panel."
                    : "Use the Files panel on the left to open a folder."}
                </p>
              </div>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
