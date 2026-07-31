"use client";

import { type UIMessage } from "ai";
import { useState, useRef, useEffect } from "react";
import { Bot, Brain, Command, Copy, Redo2, Undo2 } from "lucide-react";
import {
  CheckmarkedButton,
  useCheckmarkedFeedback,
} from "@/components/common/checkmarked-button";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getTextContent } from "@/lib/chat/chat-storage";
import { writeUserMessageToClipboard } from "@/lib/chat/chat-message-copy";
import {
  parseChatMessageSlashCommands,
  getReferenceTypeLabel,
  parseChatMessageReferences,
  type ChatSlashCommandCategory,
} from "@/lib/chat/chat-references";
import { CHAT_REFERENCE_TYPE_ICONS } from "@/lib/chat/chat-reference-icons";
import { useOrionSettings } from "@/hooks/use-orion-settings";

const USER_MESSAGE_CHIP_CLASS =
  "border-primary-foreground/20 bg-primary-foreground/10";

/** Returns the display category for slash command metadata with legacy fallback. */
function getSlashCommandCategory(category: ChatSlashCommandCategory | undefined): ChatSlashCommandCategory {
  return category ?? "builtin";
}

/** Returns the icon that visually identifies a slash-command chip category. */
function getSlashCommandIcon(category: ChatSlashCommandCategory) {
  switch (category) {
    case "subagent":
      return Bot;
    case "skill":
      return Brain;
    case "builtin":
      return Command;
  }
}

interface UserMessageProps {
  message: UIMessage;
  onClick?: () => void;
  isClickable?: boolean;
  checkpointId?: string;
  checkpointAction?: "restore" | "redo";
  onRestoreCheckpoint?: (checkpointId: string, action: "restore" | "redo") => void;
}

export function UserMessage({
  message,
  onClick,
  isClickable = false,
  checkpointId,
  checkpointAction,
  onRestoreCheckpoint,
}: UserMessageProps) {
  const { effectiveSettings } = useOrionSettings();
  const chatFontSize = effectiveSettings.chat.fontSize;
  const { checked: isCopied, showCheckmark } = useCheckmarkedFeedback();
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  const textContent = getTextContent(message);
  const references = parseChatMessageReferences(message.metadata);
  const slashCommands = parseChatMessageSlashCommands(message.metadata);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () =>
      setHasOverflow(el.scrollHeight > el.clientHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [textContent, references.length, slashCommands.length]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the message click
    try {
      await writeUserMessageToClipboard(message);
      showCheckmark();
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const handleRestoreCheckpoint = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the message click
    if (checkpointId && checkpointAction) {
      onRestoreCheckpoint?.(checkpointId, checkpointAction);
    }
  };
  const canRestoreCheckpoint = Boolean(checkpointId && checkpointAction && onRestoreCheckpoint);
  const CheckpointIcon = checkpointAction === "redo" ? Redo2 : Undo2;

  return (
    <div
      className={`flex max-w-full min-w-0 flex-col items-end ${isClickable ? "cursor-pointer" : ""
        }`}
    >
      {/* Message content — max height with gradient fade when truncated */}
      <div
        ref={contentRef}
        className={`corner-squircle relative max-h-[8rem] max-w-full min-w-0 overflow-hidden px-3 py-1 bg-primary text-primary-foreground rounded-l-lg rounded-tr-lg ${isClickable ? "hover:text-background/70 transition-colors" : ""
          }`}
        onClick={onClick}
      >
        {slashCommands.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {slashCommands.map((command, index) => {
              const category = getSlashCommandCategory(command.category);
              const Icon = getSlashCommandIcon(category);
              return (
                <span
                  key={`${command.label}-${command.name ?? category}-${index}`}
                  className={`inline-flex max-w-[14rem] items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.75em] font-medium ${USER_MESSAGE_CHIP_CLASS}`}
                  title={`${category === "subagent" ? "Sub-agent" : category === "skill" ? "Skill" : "Command"}: ${command.label}`}
                >
                  <Icon className="h-3 w-3 shrink-0 opacity-80" />
                  <span className="truncate">{command.label}</span>
                </span>
              );
            })}
          </div>
        )}
        {references.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {references.map((reference) => {
              const Icon = CHAT_REFERENCE_TYPE_ICONS[reference.type];
              return (
                <span
                  key={reference.id}
                  className="inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-primary-foreground/20 bg-primary-foreground/10 px-1.5 py-0.5 text-[0.75em] font-medium"
                  title={`${getReferenceTypeLabel(reference.type)}: ${reference.label}`}
                >
                  <Icon className="h-3 w-3 shrink-0 opacity-80" />
                  <span className="truncate">{reference.label}</span>
                </span>
              );
            })}
          </div>
        )}
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ fontSize: chatFontSize }}>
          {textContent}
        </p>
        {/* Gradient overlay to indicate more text below when content overflows */}
        {hasOverflow && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-primary to-transparent"
            aria-hidden
          />
        )}
      </div>

      {/* Action buttons */}
      <TooltipProvider delayDuration={300}>
        <div className="mt-0.5 flex items-center gap-0.5">
          {canRestoreCheckpoint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRestoreCheckpoint}
                  aria-label={checkpointAction === "redo" ? "Redo Changes" : "Undo Changes"}
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
                >
                  <CheckpointIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{checkpointAction === "redo" ? "Redo Changes" : "Undo Changes"}</p>
              </TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <CheckmarkedButton
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                aria-label="Copy message"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
                checked={isCopied}
                icon={<Copy />}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p>{isCopied ? "Copied!" : "Copy message"}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}
