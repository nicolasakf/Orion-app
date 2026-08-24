"use client";

import { ListOrdered, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import type { QueuedMessage } from "./types";

interface QueuedMessagesBarProps {
  messages: QueuedMessage[];
  onRemove?: (id: string) => void;
}

/** Count of @-references and file attachments on a queued composer message. */
function attachmentCount(message: QueuedMessage): number {
  return message.references.length + message.attachments.length;
}

/** Compact label for queued attachments, matching the goal bar's meta slot. */
function attachmentMeta(message: QueuedMessage): string | null {
  const count = attachmentCount(message);
  if (count === 0) {
    return null;
  }
  return `${count} attachment${count === 1 ? "" : "s"}`;
}

/** Preview line for a queued prompt, including attachment-only drafts. */
function messagePreview(message: QueuedMessage): string {
  return message.text.trim() || "Attached external file(s).";
}

/** Composer overlay listing prompts waiting until the current agent run finishes. */
export function QueuedMessagesBar({
  messages,
  onRemove,
}: QueuedMessagesBarProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="relative z-0 mx-3 mb-[-10px]">
      <Card
        aria-label="Queued messages"
        className="flex flex-col border-border/50 bg-muted/50 px-1 pb-3 pt-1 text-sm shadow-none"
      >
        {messages.map((queued, index) => {
          const attachments = attachmentMeta(queued);
          const meta =
            index === 0 && messages.length > 1
              ? `${messages.length} messages`
              : attachments;

          return (
            <div key={queued.id} className="flex items-center gap-1">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1">
                {index === 0 ? (
                  <ListOrdered className="h-4 w-4 shrink-0" />
                ) : (
                  <span className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  {index === 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Queued</span>
                      {meta ? (
                        <span className="text-[10px] text-muted-foreground">
                          {meta}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="truncate text-xs text-muted-foreground">
                    {messagePreview(queued)}
                  </p>
                  {index > 0 && attachments ? (
                    <p className="text-[10px] text-muted-foreground">
                      {attachments}
                    </p>
                  ) : null}
                </div>
              </div>
              {onRemove ? (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Remove queued message"
                    title="Remove from queue"
                    onClick={() => onRemove(queued.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
