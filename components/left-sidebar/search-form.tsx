import type React from "react"
import { Search } from "lucide-react"
import { useEffect, useRef } from "react"

import { Label } from "@/components/ui/label"
import { SidebarGroup, SidebarGroupContent, SidebarInput } from "@/components/ui/sidebar"

export function SearchForm({ ...props }: React.ComponentProps<"form">) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Add keyboard shortcut to focus the search input
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd+K (macOS) or Ctrl+K (Windows/Linux)
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <form {...props}>
      <SidebarGroup className="py-0">
        <SidebarGroupContent className="relative">
          <Label htmlFor="search" className="sr-only">
            Search
          </Label>
          <SidebarInput 
            ref={inputRef}
            id="search" 
            placeholder="Ask anything" 
            className="pl-8 pr-12" 
          />
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />
          <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground select-none">
            ⌘ K
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    </form>
  )
}
