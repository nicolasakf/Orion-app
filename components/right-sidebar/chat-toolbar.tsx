"use client";

import { useEffect, useRef, useCallback } from "react";
import { Plus, History, Pencil, Trash2, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { CmdOrCtrl, Shift } from "@/components/common/keyboard-icons";
import { ToolbarButton } from "../common/toolbar-button";
import { getRelativeDay } from "@/lib/utils";
import type { Chat } from "@/lib/chat/chat-storage";
import {
  ChatOptionsMenuItems,
  type ChatOptionsMenuActions,
} from "./chat-options-menu";

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
  onTitleChange: (value: string) => void;
  onTitleSave: () => void;
  onTitleCancel: () => void;
  isHistoryPopoverOpen: boolean;
  onHistoryPopoverOpenChange: (open: boolean) => void;
  onNewChat: () => void;
  onHistorySelect: (chatId: string) => void;
  onRenameChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onExportTranscript: () => void;
}

export function ChatToolbar({
  currentChat,
  isEditingTitle,
  editedTitle,
  chats,
  currentChatId,
  onTitleChange,
  onTitleSave,
  onTitleCancel,
  isHistoryPopoverOpen,
  onHistoryPopoverOpenChange,
  onNewChat,
  onHistorySelect,
  onRenameChat,
  onDeleteChat,
  onExportTranscript,
}: ChatToolbarProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const copyClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    return () => {
      if (copyClickTimerRef.current) clearTimeout(copyClickTimerRef.current);
    };
  }, []);

  const handleHistorySelect = (chatId: string) => {
    onHistorySelect(chatId);
    onHistoryPopoverOpenChange(false);
  };

  const handleRenameClick = (chatId: string) => {
    onRenameChat(chatId);
    onHistoryPopoverOpenChange(false);
  };

  const handleCopyChatId = useCallback(async () => {
    if (!currentChatId) return;
    try {
      await navigator.clipboard.writeText(currentChatId);
      toast.success("Chat ID copied to clipboard");
    } catch (error) {
      console.error("Failed to copy chat ID:", error);
      toast.error("Failed to copy chat ID.");
    }
  }, [currentChatId]);

  /** Single click copies the chat ID; delayed so double-click can cancel and rename instead. */
  const handleTitleClick = useCallback(() => {
    if (!currentChatId) return;
    if (copyClickTimerRef.current) clearTimeout(copyClickTimerRef.current);
    copyClickTimerRef.current = setTimeout(() => {
      void handleCopyChatId();
      copyClickTimerRef.current = null;
    }, 250);
  }, [currentChatId, handleCopyChatId]);

  const handleTitleDoubleClick = useCallback(() => {
    if (copyClickTimerRef.current) {
      clearTimeout(copyClickTimerRef.current);
      copyClickTimerRef.current = null;
    }
    if (currentChatId) onRenameChat(currentChatId);
  }, [currentChatId, onRenameChat]);

  const chatOptionsActions: ChatOptionsMenuActions = {
    currentChatId,
    onCopyChatId: handleCopyChatId,
    onExportTranscript,
    onRenameChat: () => {
      if (currentChatId) onRenameChat(currentChatId);
    },
    onDeleteChat: () => {
      if (currentChatId) onDeleteChat(currentChatId);
    },
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
                  type="button"
                  disabled={!currentChatId}
                  onClick={handleTitleClick}
                  onDoubleClick={handleTitleDoubleClick}
                  title={
                    currentChatId
                      ? "Click to copy chat ID · Double-click to rename"
                      : undefined
                  }
                  className="corner-squircle text-sm font-bold text-left truncate hover:text-foreground/50 transition-colors bg-accent rounded-md px-2 py-1 w-auto max-w-full block disabled:cursor-default disabled:opacity-60"
                >
                  <span className="truncate block">
                    {currentChat?.title || "New Chat"}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <ChatOptionsMenuItems
                  actions={chatOptionsActions}
                  Item={ContextMenuItem}
                />
              </ContextMenuContent>
            </ContextMenu>
          )}
        </div>

        {/* Right side — pinned to the trailing edge of the toolbar row */}
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ToolbarButton
                toolTipLabel="Chat options"
                disabled={!currentChatId}
              >
                <MoreHorizontal className="h-4 w-4" />
              </ToolbarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <ChatOptionsMenuItems
                actions={chatOptionsActions}
                Item={DropdownMenuItem}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          {/* New Chat Button */}
          <ToolbarButton
            onClick={onNewChat}
            toolTipLabel="New Chat"
            toolTipShortcut={[[CmdOrCtrl, Shift, "O"]]}
          >
            <Plus className="h-4 w-4" />
          </ToolbarButton>
          {/* Chat History Popover */}
          <Popover
            open={isHistoryPopoverOpen}
            onOpenChange={onHistoryPopoverOpenChange}
          >
            <PopoverTrigger asChild>
              <ToolbarButton
                toolTipLabel="Chat History"
                toolTipShortcut={[[CmdOrCtrl, "H"]]}
              >
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
