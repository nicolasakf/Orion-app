"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

export type DialogShortcutKey = "Enter" | "Escape" | "Backspace"

interface DialogShortcutRegistration {
  id: string
  shortcut: DialogShortcutKey
  disabled?: boolean
  allowEditableTarget?: boolean
  trigger: () => void
}

interface DialogShortcutContextValue {
  registerShortcut: (registration: DialogShortcutRegistration) => () => void
}

interface DialogShortcutController {
  registrations: Map<string, DialogShortcutRegistration>
}

const DialogShortcutContext =
  React.createContext<DialogShortcutContextValue | null>(null)

const activeDialogShortcutControllers: DialogShortcutController[] = []

/** Returns true when a keyboard event includes modifiers unsupported by dialog option shortcuts. */
function hasShortcutModifier(event: KeyboardEvent) {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
}

/** Detects inputs and editable regions so dialog shortcuts do not interrupt typing. */
function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
    )
  )
}

/** Fully consumes a dialog shortcut before other app-level keyboard handlers see it. */
function stopDialogShortcutEvent(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

/** Activates the first enabled option registered for the pressed shortcut key. */
function handleDialogShortcutKeyDown(
  event: KeyboardEvent,
  registrations: Map<string, DialogShortcutRegistration>
) {
  if (hasShortcutModifier(event)) return

  const matchingRegistrations = Array.from(registrations.values()).filter(
    (registration) => registration.shortcut === event.key
  )

  if (matchingRegistrations.length === 0) return

  const isEditableTarget = isEditableKeyboardTarget(event.target)
  const enabledRegistration = matchingRegistrations.find(
    (registration) =>
      !registration.disabled &&
      (!isEditableTarget || registration.allowEditableTarget)
  )

  if (!enabledRegistration) {
    if (!isEditableTarget) {
      stopDialogShortcutEvent(event)
    }
    return
  }

  stopDialogShortcutEvent(event)
  enabledRegistration.trigger()
}

/** Converts shortcut keys to compact labels for dialog option badges. */
function formatDialogShortcut(shortcut: DialogShortcutKey) {
  if (shortcut === "Escape") return "Esc"
  return shortcut
}

/** Provides shortcut registration and top-most-dialog keyboard ownership. */
export function DialogShortcutProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const registrationsRef = React.useRef(
    new Map<string, DialogShortcutRegistration>()
  )
  const controllerRef = React.useRef<DialogShortcutController | null>(null)

  if (!controllerRef.current) {
    controllerRef.current = {
      registrations: registrationsRef.current,
    }
  }

  React.useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return

    activeDialogShortcutControllers.push(controller)

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeController =
        activeDialogShortcutControllers[
        activeDialogShortcutControllers.length - 1
        ]

      if (activeController !== controller) return
      handleDialogShortcutKeyDown(event, controller.registrations)
    }

    window.addEventListener("keydown", handleKeyDown, true)

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true)

      const index = activeDialogShortcutControllers.indexOf(controller)
      if (index !== -1) {
        activeDialogShortcutControllers.splice(index, 1)
      }
    }
  }, [])

  const registerShortcut = React.useCallback(
    (registration: DialogShortcutRegistration) => {
      registrationsRef.current.set(registration.id, registration)

      return () => {
        registrationsRef.current.delete(registration.id)
      }
    },
    []
  )

  return (
    <DialogShortcutContext.Provider value={{ registerShortcut }}>
      {children}
    </DialogShortcutContext.Provider>
  )
}

/** Registers one dialog option with the nearest dialog shortcut provider. */
export function useDialogShortcutRegistration({
  allowEditableTarget,
  disabled,
  shortcut,
  trigger,
}: {
  allowEditableTarget?: boolean
  disabled?: boolean
  shortcut?: DialogShortcutKey
  trigger: () => void
}) {
  const context = React.useContext(DialogShortcutContext)
  const id = React.useId()

  React.useEffect(() => {
    if (!context || !shortcut) return

    return context.registerShortcut({
      allowEditableTarget,
      disabled,
      id,
      shortcut,
      trigger,
    })
  }, [allowEditableTarget, context, disabled, id, shortcut, trigger])
}

/** Renders the subdued key badge shown inside a dialog option button. */
export function DialogShortcutBadge({
  className,
  shortcut,
}: {
  className?: string
  shortcut: DialogShortcutKey
}) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-4 min-h-4 shrink-0 select-none items-center rounded border bg-muted px-1 font-mono text-[10px] font-medium leading-none text-muted-foreground opacity-55",
        className
      )}
    >
      {formatDialogShortcut(shortcut)}
    </kbd>
  )
}

export type DialogShortcutProps = {
  /** Keyboard shortcut that activates this dialog option while the dialog is open. */
  shortcut?: DialogShortcutKey
  /** Allows the shortcut to fire while focus is inside an editable field. */
  allowShortcutFromEditableTarget?: boolean
}

/** Combines forwarded and local refs for shortcut-aware primitive wrappers. */
export function composeRefs<T>(
  ...refs: Array<React.ForwardedRef<T> | undefined>
) {
  return (node: T) => {
    refs.forEach((ref) => {
      if (!ref) return

      if (typeof ref === "function") {
        ref(node)
      } else {
        ref.current = node
      }
    })
  }
}
