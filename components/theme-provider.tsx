"use client"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import type { ThemeProviderProps } from "next-themes"
import { useEffect } from "react"

const ELECTRON_WINDOW_BACKGROUND = {
  dark: "#131316",
  light: "#f5f5f5",
} as const

/**
 * Syncs the `data-color-mode` attribute on `<html>` with the current theme.
 * This attribute is required by @uiw/react-markdown-preview for correct
 * light/dark rendering. Centralizing it here prevents individual component
 * unmounts (e.g. cell deletion) from stripping the attribute.
 */
function DataColorModeSync() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const nextMode = resolvedTheme === "dark" ? "dark" : "light"

    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-color-mode", nextMode)
    }

    void window.orionDesktopShell?.setWindowBackgroundColor(
      ELECTRON_WINDOW_BACKGROUND[nextMode]
    )
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
