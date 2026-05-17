"use client";

import { useState, useEffect, useRef } from "react";
import { Plus, History, Pencil, Trash2, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
import { ToolbarButton } from "../common/toolbar-button";
import { getRelativeDay } from "@/lib/utils";
import type { Chat } from "@/lib/chat/chat-storage";

// ============================================================================
// ChatHistoryItem
// ============================================================================

interface ChatHistoryItemProps {
  chat: Chat;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function ChatHistoryItem({
  chat,
  onSelect,
  onRename,
  onDelete,
}: ChatHistoryItemProps) {
  return (
    <CommandItem
      value={`${chat.title}-${chat.id}`}
      onSelect={onSelect}
      className="group flex items-center justify-between gap-2"
    >
      <div className="flex flex-col min-w-0 flex-1">
        <span className="truncate font-medium">{chat.title}</span>
      </div>
      <div className="flex items-center">
        <div className="hidden group-hover:flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onRename();
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </CommandItem>
  );
}

// ============================================================================
// ChatToolbar
// ============================================================================

export interface ChatToolbarProps {
  currentChat: Chat | undefined;
  isEditingTitle: boolean;
  editedTitle: string;
  chats: Chat[];
  currentChatId: string | null;
  onTitleDoubleClick: () => void;
  onTitleChange: (value: string) => void;
  onTitleSave: () => void;
  onTitleCancel: () => void;
  onNewChat: () => void;
  onHistorySelect: (chatId: string) => void;
  onRenameChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
}

export function ChatToolbar({
  currentChat,
  isEditingTitle,
  editedTitle,
  chats,
  currentChatId,
  onTitleDoubleClick,
  onTitleChange,
  onTitleSave,
  onTitleCancel,
  onNewChat,
  onHistorySelect,
  onRenameChat,
  onDeleteChat,
}: ChatToolbarProps) {
  const [isHistoryPopoverOpen, setIsHistoryPopoverOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleHistorySelect = (chatId: string) => {
    onHistorySelect(chatId);
    setIsHistoryPopoverOpen(false);
  };

  const handleRenameClick = (chatId: string) => {
    onRenameChat(chatId);
    setIsHistoryPopoverOpen(false);
  };

  const sortedChats = [...chats].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

  const groupedChats = sortedChats.reduce((acc, chat) => {
    const dateLabel = getRelativeDay(chat.updatedAt);
    if (!acc[dateLabel]) {
      acc[dateLabel] = [];
    }
    acc[dateLabel].push(chat);
    return acc;
  }, {} as Record<string, Chat[]>);

  return (
    <div className="sticky top-0 z-10 flex h-14 w-full min-w-0 shrink-0 items-center bg-sidebar px-2">
      <div className="flex h-full w-full min-w-0 items-center justify-between gap-2">
        {/* Left side - Chat title */}
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <Input
              ref={titleInputRef}
              value={editedTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              onBlur={onTitleSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") onTitleSave();
                if (e.key === "Escape") onTitleCancel();
              }}
              className="w-full bg-transparent outline-none placeholder:text-muted-foreground resize-none"
            />
          ) : (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button
                  onDoubleClick={onTitleDoubleClick}
                  className="corner-squircle text-sm font-bold text-left truncate hover:text-foreground/50 transition-colors bg-accent rounded-md px-2 py-1 w-auto max-w-full block"
                >
                  <span className="truncate block">
                    {currentChat?.title || "New Chat"}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  disabled={!currentChatId}
                  onSelect={async () => {
                    if (currentChatId) {
                      await navigator.clipboard.writeText(currentChatId);
                      toast.success("Chat ID copied to clipboard");
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy chat ID
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          )}
        </div>

        {/* Right side — pinned to the trailing edge of the toolbar row */}
        <div className="flex shrink-0 items-center gap-1">
          {/* New Chat Button */}
          <ToolbarButton onClick={onNewChat} toolTipLabel="New Chat">
            <Plus className="h-4 w-4" />
          </ToolbarButton>
          {/* Chat History Popover */}
          <Popover
            open={isHistoryPopoverOpen}
            onOpenChange={setIsHistoryPopoverOpen}
          >
            <PopoverTrigger asChild>
              <ToolbarButton toolTipLabel="Chat History">
                <History className="h-4 w-4" />
              </ToolbarButton>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-1" align="end">
              <Command>
                <CommandInput placeholder="Search chat history..." />
                <CommandEmpty>No chats found.</CommandEmpty>
                <CommandList>
                  {Object.entries(groupedChats).map(
                    ([dateLabel, chatsInGroup]) => (
                      <CommandGroup key={dateLabel} heading={dateLabel}>
                        {chatsInGroup.map((chat) => (
                          <ChatHistoryItem
                            key={chat.id}
                            chat={chat}
                            onSelect={() => handleHistorySelect(chat.id)}
                            onRename={() => handleRenameClick(chat.id)}
                            onDelete={() => onDeleteChat(chat.id)}
                          />
                        ))}
                      </CommandGroup>
                    )
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
