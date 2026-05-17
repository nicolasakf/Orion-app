"use client"
import { Check, ChevronsUpDown, File } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

export function CurrentFileDisplay({
  currentFile,
  recentFiles,
  onFileSelect,
}: {
  currentFile: { name: string; path: string }
  recentFiles: Array<{ name: string; path: string }>
  onFileSelect: (file: { name: string; path: string }) => void
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="corner-squircle flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <File className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold truncate max-w-[120px]">{currentFile.name}</span>
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">{currentFile.path}</span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]" align="start">
            <DropdownMenuLabel>Recent Files</DropdownMenuLabel>
            {recentFiles.map((file) => (
              <DropdownMenuItem key={file.path} onSelect={() => onFileSelect(file)}>
                <div className="flex items-center gap-2">
                  <File className="h-4 w-4" />
                  <span className="truncate">{file.name}</span>
                </div>
                <span className="ml-auto text-xs text-muted-foreground">
                  {file.path === currentFile.path && <Check className="h-4 w-4" />}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
