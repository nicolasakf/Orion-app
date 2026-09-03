"use client";

import * as React from "react";
import {
  CheckCircle2,
  CircleAlert,
  Pause,
  Play,
  ShieldCheck,
  Square,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { GoalSession } from "@/lib/agent/goals/types";

interface GoalStatusBarProps {
  session: GoalSession;
  onOpen: () => void;
  onResume: () => void;
  onPause: () => void;
  onEnd: () => void;
}

/** Persistent progress and control surface for the active supervised goal. */
export function GoalStatusBar({
  session,
  onOpen,
  onResume,
  onPause,
  onEnd,
}: GoalStatusBarProps) {
  const [endDialogOpen, setEndDialogOpen] = React.useState(false);
  const terminal = session.status !== "active" && session.status !== "paused";
  const completed = session.status === "completed";
  const label = completed
    ? "Goal reached"
    : session.status === "stopped"
      ? "Goal ended"
    : session.status === "active"
      ? session.phase === "evaluating" ? "Reviewing goal" : "Working toward goal"
      : session.status.replaceAll("_", " ");
  const Icon = completed ? CheckCircle2 : terminal ? CircleAlert : ShieldCheck;
  const statusExplanation = session.status === "stalled"
    ? session.stallReason === "unchanged_criteria"
      ? "Goal stopped because two repairs produced no criterion-level progress."
      : "Goal stopped because consecutive repairs did not change the saved artifacts."
    : null;

  return (
    <>
      <div className="relative z-0 mx-auto mb-[-10px] w-full max-w-2xl px-1.5">
        <Card
          className={cn(
            "mx-3 flex items-center gap-1 border-border/50 bg-muted/50 px-1 pb-3 pt-1 text-sm shadow-none transition-colors hover:bg-muted/70",
            completed && "border-emerald-500/30 bg-emerald-500/5"
          )}
        >
          <button
            type="button"
            aria-label="Open goal supervisor"
            onClick={onOpen}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Icon className={cn("h-4 w-4 shrink-0", completed && "text-emerald-600")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium capitalize">{label}</span>
                <span className="text-[10px] text-muted-foreground">
                  {session.reviewCount}/{session.maxReviews} reviews
                </span>
              </div>
              <p
                className="truncate text-xs text-muted-foreground"
                title={session.pauseReason ?? session.contract.objective}
              >
                {statusExplanation ?? (session.status === "paused" && session.pauseReason
                  ? session.pauseReason
                  : session.contract.objective)}
              </p>
            </div>
          </button>
          {(session.status === "active" || session.status === "paused") && (
            <div className="flex shrink-0 items-center gap-0.5">
              {session.status === "active" ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Pause goal supervision"
                  title="Pause goal"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPause();
                  }}
                >
                  <Pause className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Resume goal supervision"
                  title="Resume goal"
                  onClick={(event) => {
                    event.stopPropagation();
                    onResume();
                  }}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="End goal"
                title="End goal"
                onClick={(event) => {
                  event.stopPropagation();
                  setEndDialogOpen(true);
                }}
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </Card>
      </div>

      <AlertDialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>End this goal?</AlertDialogTitle>
            <AlertDialogDescription>
              The contract and review history will remain in this chat, but this goal cannot be
              resumed. Any worker response currently being generated will not be interrupted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel shortcut="Escape">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              shortcut="Enter"
              onClick={onEnd}
            >
              End goal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
