"use client";

import { type UIMessage } from "ai";
import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, Brain, ChevronDown, ChevronUp, Command, Copy, MessageSquareText, Pencil, Redo2, Target, Undo2 } from "lucide-react";
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
  parseChatMessageGoalMessage,
  type ChatSlashCommandCategory,
  type ResolvedChatReference,
} from "@/lib/chat/chat-references";
import { CHAT_REFERENCE_TYPE_ICONS } from "@/lib/chat/chat-reference-icons";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { cn } from "@/lib/utils";
import {
  SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
  type ScrollToNotebookCellEventDetail,
} from "@/lib/notebook/notebook-execution-events";

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
  onEdit?: () => void;
  checkpointId?: string;
  checkpointAction?: "restore" | "redo";
  onRestoreCheckpoint?: (checkpointId: string, action: "restore" | "redo") => void;
  /** When false, hides copy/edit/restore controls below the bubble. */
  showActions?: boolean;
  /** Overrides the global chat font size for this bubble. */
  fontSize?: number;
  /** Optional classes merged onto the message bubble surface. */
  bubbleClassName?: string;
}

export function UserMessage({
  message,
  onEdit,
  checkpointId,
  checkpointAction,
  onRestoreCheckpoint,
  showActions = true,
  fontSize,
  bubbleClassName,
}: UserMessageProps) {
  const { effectiveSettings } = useOrionSettings();
  const chatFontSize = fontSize ?? effectiveSettings.chat.fontSize;
  const { checked: isCopied, showCheckmark } = useCheckmarkedFeedback();
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const textContent = getTextContent(message);
  const references = parseChatMessageReferences(message.metadata);
  const slashCommands = parseChatMessageSlashCommands(message.metadata);
  const goalMessage = parseChatMessageGoalMessage(message.metadata);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => {
      if (!isExpanded) {
        setHasOverflow(el.scrollHeight > el.clientHeight);
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isExpanded, textContent, references.length, slashCommands.length]);

  useEffect(() => {
    setIsExpanded(false);
  }, [message.id]);

  /** Expands a truncated message when the user clicks its text. */
  const handleMessageClick = useCallback(() => {
    if (hasOverflow && !isExpanded) {
      setIsExpanded(true);
    }
  }, [hasOverflow, isExpanded]);

  /** Reveals the cell or output targeted by a notebook reference chip. */
  const navigateToNotebookReference = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, reference: ResolvedChatReference) => {
      event.stopPropagation();
      const { locator } = reference;
      const detail: ScrollToNotebookCellEventDetail | null =
        locator.type === "output"
          ? {
              cellIndex: locator.cellIndex,
              outputIndex: locator.outputIndex,
            }
          : locator.type === "cell"
            ? { cellIndex: locator.cellIndices[0] ?? -1 }
            : null;

      if (!detail || detail.cellIndex < 0) return;
      window.dispatchEvent(
        new CustomEvent<ScrollToNotebookCellEventDetail>(
          SCROLL_TO_NOTEBOOK_CELL_EVENT_NAME,
          { detail },
        ),
      );
    },
    [],
  );

  /** Toggles the full-message view without also handling the bubble click. */
  const handleExpansionButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((current) => !current);
  }, []);

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

  /** Opens this message in the composer without triggering bubble expansion. */
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.();
  };
  const canRestoreCheckpoint = Boolean(checkpointId && checkpointAction && onRestoreCheckpoint);
  const CheckpointIcon = checkpointAction === "redo" ? Redo2 : Undo2;

  return (
    <div className="group flex max-w-full min-w-0 flex-col items-end">
      {/* Message content — click a truncated bubble to reveal its full text. */}
      <div
        ref={contentRef}
        className={cn(
          "corner-squircle relative max-w-full min-w-0 overflow-hidden rounded-l-lg rounded-tr-lg bg-primary px-3 py-1 text-primary-foreground",
          bubbleClassName,
          isExpanded ? "max-h-none" : "max-h-[8rem]",
          hasOverflow && "pb-7",
          hasOverflow && !isExpanded && "cursor-pointer",
        )}
        onClick={handleMessageClick}
      >
        {goalMessage ? (
          <div className="mb-1 flex">
            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.75em] font-semibold ${USER_MESSAGE_CHIP_CLASS}`}>
              {goalMessage.source === "supervisor" ? (
                <Target className="h-3 w-3" />
              ) : (
                <MessageSquareText className="h-3 w-3" />
              )}
              {goalMessage.source === "supervisor" ? "Supervisor" : "Worker message"}
            </span>
          </div>
        ) : null}
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
              const isNotebookReference =
                reference.locator.type === "cell" ||
                reference.locator.type === "output";
              return (
                <span
                  key={reference.id}
                  className="inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-primary-foreground/20 bg-primary-foreground/10 px-1.5 py-0.5 text-[0.75em] font-medium"
                  title={`${getReferenceTypeLabel(reference.type)}: ${reference.label}`}
                >
                  {isNotebookReference ? (
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-1 text-left hover:text-primary-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-foreground"
                      onClick={(event) =>
                        navigateToNotebookReference(event, reference)
                      }
                      aria-label={`Go to ${reference.label}`}
                    >
                      <Icon className="h-3 w-3 shrink-0 opacity-80" />
                      <span className="truncate">{reference.label}</span>
                    </button>
                  ) : (
                    <>
                      <Icon className="h-3 w-3 shrink-0 opacity-80" />
                      <span className="truncate">{reference.label}</span>
                    </>
                  )}
                </span>
              );
            })}
          </div>
        )}
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ fontSize: chatFontSize }}>
          {textContent}
        </p>
        {/* Gradient overlay to indicate more text below when content overflows. */}
        {hasOverflow && !isExpanded && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-primary to-transparent"
            aria-hidden
          />
        )}
        {hasOverflow && (
          <button
            type="button"
            className="absolute bottom-1 left-2 z-10 inline-flex items-center gap-1 px-1 text-xs font-medium text-primary-foreground/90 opacity-0 transition-[color,opacity] hover:text-primary-foreground focus-visible:opacity-100 group-hover:opacity-100"
            onClick={handleExpansionButtonClick}
            aria-expanded={isExpanded}
          >
            {isExpanded ? "Show less" : "Show more"}
            {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        )}
      </div>

      {showActions ? (
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

          {onEdit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleEdit}
                  aria-label="Edit message"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
                >
                  <Pencil />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit message</p>
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
      ) : null}
    </div>
  );
}
