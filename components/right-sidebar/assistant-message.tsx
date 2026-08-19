"use client";

import * as React from "react";

import { ChatMarkdownRenderer } from "@/components/right-sidebar/chat-markdown-renderer";
import { splitStreamingMarkdown } from "@/components/right-sidebar/streaming-markdown";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { cn } from "@/lib/utils";

interface AssistantMessageProps {
  content: string;
  /** True while this is the active assistant response receiving streamed tokens. */
  isStreaming?: boolean;
  /** Optional metadata used when highlighted assistant text is mentioned in chat. */
  conversationReference?: {
    messageId: string;
    messageIndex: number;
    partIndex: number;
  };
  /** Overrides the global chat font size for this message. */
  fontSize?: number;
  /** Optional classes merged onto the message surface. */
  className?: string;
}

/** Render the one active streaming Markdown block without rich parsing. */
function PlainStreamingText({
  content,
  fontSize,
}: {
  content: string;
  fontSize: number;
}) {
  if (!content) return null;
  return (
    <div className="bg-transparent px-0 py-0.5">
      <div
        className="whitespace-pre-wrap break-words bg-transparent leading-relaxed text-foreground"
        style={{ fontSize }}
      >
        {content}
      </div>
    </div>
  );
}

export function AssistantMessage({
  content,
  isStreaming = false,
  conversationReference,
  fontSize,
  className,
}: AssistantMessageProps) {
  const { effectiveSettings } = useOrionSettings();
  const chatFontSize = fontSize ?? effectiveSettings.chat.fontSize;
  const streamingContent = React.useMemo(
    () => (isStreaming ? splitStreamingMarkdown(content) : null),
    [content, isStreaming]
  );
  const markdownSource = streamingContent ? streamingContent.stable : content;

  return (
    <div
      className={cn("bg-transparent px-1 py-1", className)}
      data-orion-conversation-reference={conversationReference ? "true" : undefined}
      data-orion-conversation-source={conversationReference ? "assistant" : undefined}
      data-orion-message-id={conversationReference?.messageId}
      data-orion-message-index={conversationReference?.messageIndex}
      data-orion-part-index={conversationReference?.partIndex}
    >
      <ChatMarkdownRenderer source={markdownSource} fontSize={chatFontSize} />
      {streamingContent && (
        <PlainStreamingText
          content={streamingContent.tail}
          fontSize={chatFontSize}
        />
      )}
    </div>
  );
}
