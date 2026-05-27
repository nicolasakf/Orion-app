"use client";

import type { ComponentType, ReactNode } from "react";
import { Copy, FileDown, Pencil, Trash2 } from "lucide-react";

/** Actions exposed by the chat options menu (dropdown and title context menu). */
export interface ChatOptionsMenuActions {
  currentChatId: string | null;
  onCopyChatId: () => void | Promise<void>;
  onExportTranscript: () => void;
  onRenameChat: () => void;
  onDeleteChat: () => void;
}

type SharedMenuItemProps = {
  disabled?: boolean;
  onSelect?: (event: Event) => void;
  className?: string;
  children?: ReactNode;
};

interface ChatOptionsMenuItemsProps {
  actions: ChatOptionsMenuActions;
  /** Radix menu item primitive (`DropdownMenuItem` or `ContextMenuItem`). */
  Item: ComponentType<SharedMenuItemProps>;
}

/** Shared chat options entries for dropdown and context menus. */
export function ChatOptionsMenuItems({ actions, Item }: ChatOptionsMenuItemsProps) {
  const disabled = !actions.currentChatId;

  return (
    <>
      <Item
        disabled={disabled}
        onSelect={() => {
          void actions.onCopyChatId();
        }}
      >
        <Copy className="h-4 w-4" />
        Copy chat ID
      </Item>
      <Item disabled={disabled} onSelect={() => actions.onExportTranscript()}>
        <FileDown className="h-4 w-4" />
        Export transcript
      </Item>
      <Item disabled={disabled} onSelect={() => actions.onRenameChat()}>
        <Pencil className="h-4 w-4" />
        Rename chat
      </Item>
      <Item
        disabled={disabled}
        className="text-destructive focus:text-destructive data-[variant=destructive]:text-destructive"
        onSelect={() => actions.onDeleteChat()}
      >
        <Trash2 className="h-4 w-4" />
        Delete chat
      </Item>
    </>
  );
}
