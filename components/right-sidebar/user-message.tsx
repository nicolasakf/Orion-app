"use client";

import { type UIMessage } from "ai";
import { useState, useRef, useEffect } from "react";
import {
  Copy,
  Undo2,
  Check,
  FileText,
  Folder,
  Hash,
  Braces,
  Terminal,
  MessagesSquare,
} from "lucide-react";
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
  type ChatReferenceType,
} from "@/lib/chat/chat-references";
import { useOrionSettings } from "@/hooks/use-orion-settings";

const REFERENCE_TYPE_ICONS: Record<ChatReferenceType, React.ComponentType<{ className?: string }>> = {
  file: FileText,
  folder: Folder,
  cell: Hash,
  variable: Braces,
  terminal: Terminal,
  conversation: MessagesSquare,
};

interface UserMessageProps {
  message: UIMessage;
  onClick?: () => void;
  isClickable?: boolean;
}

export function UserMessage({
  message,
  onClick,
  isClickable = false,
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
    // TODO: Implement restore checkpoint functionality
    console.log("Restore checkpoint for message:", message.id);
  };

  return (
    <div
      className={`flex items-center gap-3 max-w-full min-w-0 group ${isClickable ? "cursor-pointer" : ""
        }`}
    >
      {/* Action buttons */}
      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRestoreCheckpoint}
                className="h-3 w-3 p-0 text-muted-foreground hover:text-foreground"
              >
                <Undo2 className="h-1 w-1" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Restore checkpoint</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-3 w-3 p-0 text-muted-foreground hover:text-foreground"
              >
                {isCopied ? (
                  <Check className="h-1 w-1" />
                ) : (
                  <Copy className="h-1 w-1" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isCopied ? "Copied!" : "Copy message"}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

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
              const Icon = REFERENCE_TYPE_ICONS[reference.type];
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
    </div>
  );
}
