"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Questionnaire as QuestionnairePrimitive } from "@shadcn/react/questionnaire";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Styled shadcn questionnaire: one question at a time, with progress,
 * validation, skip/next/submit navigation, and keyboard shortcuts.
 *
 * Adapted from https://ui.shadcn.com/docs/components/base/questionnaire for
 * Orion's chat surface — the choices read as compact pickable rows rather than
 * full-page survey cards, and the actions row sits inline instead of centred.
 */

type PrimitiveProps<T extends keyof typeof QuestionnairePrimitive> =
  React.ComponentProps<(typeof QuestionnairePrimitive)[T]>;

/** Native form root that coordinates items, answers, and navigation. */
function Questionnaire({ className, ...props }: PrimitiveProps<"Root">) {
  return (
    <QuestionnairePrimitive.Root
      data-slot="questionnaire"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

/** "Question n of m" indicator for the active item. */
function QuestionnaireProgress({ className, ...props }: PrimitiveProps<"Progress">) {
  return (
    <QuestionnairePrimitive.Progress
      data-slot="questionnaire-progress"
      className={cn(
        "text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

/** One question step. Only the active item is visible. */
function QuestionnaireItem({ className, ...props }: PrimitiveProps<"Item">) {
  return (
    <QuestionnairePrimitive.Item
      data-slot="questionnaire-item"
      className={cn(
        "m-0 flex min-w-0 flex-col gap-2 border-0 p-0",
        "data-[active]:flex [&:not([data-active])]:hidden",
        className
      )}
      {...props}
    />
  );
}

/** Question text, rendered as the item's legend. */
function QuestionnaireTitle({ className, ...props }: PrimitiveProps<"Title">) {
  return (
    <QuestionnairePrimitive.Title
      data-slot="questionnaire-title"
      className={cn("p-0 text-sm font-medium leading-snug text-foreground", className)}
      {...props}
    />
  );
}

/** Supporting line explaining why the answer matters. */
function QuestionnaireDescription({
  className,
  ...props
}: PrimitiveProps<"Description">) {
  return (
    <QuestionnairePrimitive.Description
      data-slot="questionnaire-description"
      className={cn("text-xs leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Layout container for an item's answers. */
function QuestionnaireChoices({ className, ...props }: PrimitiveProps<"Choices">) {
  return (
    <QuestionnairePrimitive.Choices
      data-slot="questionnaire-choices"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

/**
 * One selectable answer.
 *
 * The native radio/checkbox stays in the tree for keyboard and screen-reader
 * behavior but is visually replaced by the row's own checked styling.
 */
function QuestionnaireChoice({
  className,
  children,
  ...props
}: PrimitiveProps<"Choice">) {
  return (
    <QuestionnairePrimitive.Choice
      data-slot="questionnaire-choice"
      className={cn(
        "corner-squircle group relative flex cursor-pointer items-center gap-2.5 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1 has-[:focus-visible]:ring-offset-background",
        "data-[checked]:border-primary/60 data-[checked]:bg-primary/10 data-[checked]:text-foreground",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        className
      )}
      {...props}
    >
      <QuestionnairePrimitive.ChoiceInput className="sr-only" />
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center border border-input text-primary-foreground transition-colors",
          "group-data-[type=radio]:rounded-full group-data-[type=checkbox]:rounded-[4px]",
          "group-data-[checked]:border-primary group-data-[checked]:bg-primary"
        )}
      >
        <Check className="size-3 opacity-0 group-data-[checked]:opacity-100" />
      </span>
      {children}
    </QuestionnairePrimitive.Choice>
  );
}

/** Visible label inside a choice row. */
function QuestionnaireChoiceLabel({
  className,
  ...props
}: PrimitiveProps<"ChoiceLabel">) {
  return (
    <QuestionnairePrimitive.ChoiceLabel
      data-slot="questionnaire-choice-label"
      className={cn("min-w-0 flex-1 leading-snug", className)}
      {...props}
    />
  );
}

/** Keyboard shortcut badge shown at the end of a choice row. */
function QuestionnaireChoiceShortcut({
  className,
  ...props
}: PrimitiveProps<"ChoiceShortcut">) {
  return (
    <QuestionnairePrimitive.ChoiceShortcut
      data-slot="questionnaire-choice-shortcut"
      className={cn(
        "ml-auto shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

/** Free-text answer field. */
function QuestionnaireInput({ className, ...props }: PrimitiveProps<"Input">) {
  return (
    <QuestionnairePrimitive.Input
      data-slot="questionnaire-input"
      className={cn(
        "corner-squircle flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background transition-colors",
        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-destructive",
        className
      )}
      {...props}
    />
  );
}

/** Validation message for the active item. */
function QuestionnaireError({ className, ...props }: PrimitiveProps<"Error">) {
  return (
    <QuestionnairePrimitive.Error
      data-slot="questionnaire-error"
      className={cn("text-xs font-medium text-destructive", className)}
      {...props}
    />
  );
}

/** Row holding the navigation buttons. */
function QuestionnaireActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="questionnaire-actions"
      className={cn("flex flex-wrap items-center gap-2 pt-0.5", className)}
      {...props}
    />
  );
}

/** Shared classes for the four navigation buttons. */
const navigationClassName = "h-8 px-3 text-xs data-[hidden]:hidden";

/** Back to the previous item. Hidden on the first item. */
function QuestionnairePrevious({
  className,
  children = "Back",
  ...props
}: PrimitiveProps<"Previous">) {
  return (
    <QuestionnairePrimitive.Previous
      data-slot="questionnaire-previous"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        navigationClassName,
        className
      )}
      {...props}
    >
      {children}
    </QuestionnairePrimitive.Previous>
  );
}

/** Skip an optional item. Hidden when the item is required. */
function QuestionnaireSkip({
  className,
  children = "Skip",
  ...props
}: PrimitiveProps<"Skip">) {
  return (
    <QuestionnairePrimitive.Skip
      data-slot="questionnaire-skip"
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        navigationClassName,
        "ml-auto text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </QuestionnairePrimitive.Skip>
  );
}

/** Advance to the next item. Hidden on the last item. */
function QuestionnaireNext({
  className,
  children = "Next",
  ...props
}: PrimitiveProps<"Next">) {
  return (
    <QuestionnairePrimitive.Next
      data-slot="questionnaire-next"
      className={cn(
        buttonVariants({ variant: "default", size: "sm" }),
        navigationClassName,
        "ml-auto",
        className
      )}
      {...props}
    >
      {children}
    </QuestionnairePrimitive.Next>
  );
}

/** Submit the questionnaire. Only visible on the last item. */
function QuestionnaireSubmit({
  className,
  children = "Send answers",
  ...props
}: PrimitiveProps<"Submit">) {
  return (
    <QuestionnairePrimitive.Submit
      data-slot="questionnaire-submit"
      className={cn(
        buttonVariants({ variant: "default", size: "sm" }),
        navigationClassName,
        "ml-auto",
        className
      )}
      {...props}
    >
      {children}
    </QuestionnairePrimitive.Submit>
  );
}

export {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceLabel,
  QuestionnaireChoiceShortcut,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
};
