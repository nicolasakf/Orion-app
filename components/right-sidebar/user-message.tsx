"use client";

import { type UIMessage } from "ai";
import { useState, useRef, useEffect } from "react";
import { Copy, Redo2, Undo2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getTextContent } from "@/lib/chat/chat-storage";
import {
  getReferenceTypeLabel,
  parseChatMessageReferences,
} from "@/lib/chat/chat-references";
import { CHAT_REFERENCE_TYPE_ICONS } from "@/lib/chat/chat-reference-icons";
import { useOrionSettings } from "@/hooks/use-orion-settings";

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
  const [isCopied, setIsCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  const textContent = getTextContent(message);
  const references = parseChatMessageReferences(message.metadata);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () =>
      setHasOverflow(el.scrollHeight > el.clientHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [textContent]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the message click
    try {
      await navigator.clipboard.writeText(textContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
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
        className={`corner-squircle relative max-h-[8rem] overflow-hidden px-3 py-1 bg-primary text-primary-foreground rounded-l-lg rounded-tr-lg ${isClickable ? "hover:text-background/70 transition-colors" : ""
          }`}
        onClick={onClick}
      >
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
        <p className="whitespace-pre-wrap" style={{ fontSize: chatFontSize }}>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopy}
                className="h-6 w-6 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-3"
              >
                {isCopied ? <Check /> : <Copy />}
              </Button>
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
