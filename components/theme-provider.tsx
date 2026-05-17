"use client"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import type { ThemeProviderProps } from "next-themes"
import { useEffect } from "react"

/**
 * Syncs the `data-color-mode` attribute on `<html>` with the current theme.
 * This attribute is required by @uiw/react-markdown-preview for correct
 * light/dark rendering. Centralizing it here prevents individual component
 * unmounts (e.g. cell deletion) from stripping the attribute.
 */
function DataColorModeSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute(
        "data-color-mode",
        resolvedTheme === "dark" ? "dark" : "light"
      )
    }
  }, [resolvedTheme])

  return null
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props} attribute="class" defaultTheme="dark" enableSystem={true}>
      <DataColorModeSync />
      {children}
    </NextThemesProvider>
  )
}
