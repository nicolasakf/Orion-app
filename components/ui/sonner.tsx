"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, toast as sonnerToast, useSonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const TOAST_DISMISS_KEY = "Escape"

/**
 * Renders app toasts and lets users dismiss the newest visible toast with Esc.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const { toasts } = useSonner()

  React.useEffect(() => {
    const handleDismissKey = (event: KeyboardEvent) => {
      if (event.key !== TOAST_DISMISS_KEY || event.defaultPrevented) {
        return
      }

      const toastToDismiss = toasts.find((toast) => toast.dismissible !== false)

      if (!toastToDismiss) {
        return
      }

      sonnerToast.dismiss(toastToDismiss.id)
    }

    document.addEventListener("keydown", handleDismissKey)

    return () => {
      document.removeEventListener("keydown", handleDismissKey)
    }
  }, [toasts])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-left"
      toastOptions={{
        classNames: {
          toast:
            "corner-squircle group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "corner-squircle rounded-md group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "corner-squircle rounded-md group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
