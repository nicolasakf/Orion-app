"use client";

import * as React from "react";

import { ChatMarkdownRenderer } from "@/components/right-sidebar/chat-markdown-renderer";
import { splitStreamingMarkdown } from "@/components/right-sidebar/streaming-markdown";
import { useOrionSettings } from "@/hooks/use-orion-settings";

interface AssistantMessageProps {
  content: string;
  /** True while this is the active assistant response receiving streamed tokens. */
  isStreaming?: boolean;
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

export function AssistantMessage({ content, isStreaming = false }: AssistantMessageProps) {
  const { effectiveSettings } = useOrionSettings();
  const chatFontSize = effectiveSettings.chat.fontSize;
  const streamingContent = React.useMemo(
    () => (isStreaming ? splitStreamingMarkdown(content) : null),
    [content, isStreaming]
  );
  const markdownSource = streamingContent ? streamingContent.stable : content;

  return (
    <div className="bg-transparent px-1 py-1">
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
