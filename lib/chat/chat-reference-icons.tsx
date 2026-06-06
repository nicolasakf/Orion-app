import {
  Boxes,
  FileText,
  Folder,
  MessagesSquare,
  SquareChartGantt,
  StretchHorizontal,
  Terminal,
  type LucideIcon,
} from "lucide-react";

import type { ChatReferenceType } from "@/lib/chat/chat-references";

/** Lucide icons for chat reference chips — shared by composer and sent user messages. */
export const CHAT_REFERENCE_TYPE_ICONS: Record<ChatReferenceType, LucideIcon> = {
  file: FileText,
  folder: Folder,
  cell: StretchHorizontal,
  output: SquareChartGantt,
  variable: Boxes,
  terminal: Terminal,
  conversation: MessagesSquare,
  "external-file": FileText,
};
