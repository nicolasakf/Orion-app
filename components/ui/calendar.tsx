"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker, type DropdownProps } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

/** Parses DayPicker `<option>` children into select items. */
function dropdownOptions(
  children: DropdownProps["children"],
): Array<{ value: string; label: React.ReactNode }> {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child) || child.type !== "option") {
      return []
    }

    const { value, children: label } = child.props as {
      value?: string | number
      children?: React.ReactNode
    }

    if (value === undefined || value === null) {
      return []
    }

    return [{ value: String(value), label: label ?? value }]
  })
}

/** Renders month/year navigation as compact shadcn selects without visible labels. */
function CalendarDropdown({
  value,
  onChange,
  children,
  caption,
}: DropdownProps) {
  const options = dropdownOptions(children)
  const stringValue = value === undefined ? undefined : String(value)

  return (
    <Select
      value={stringValue}
      onValueChange={(nextValue) => {
        onChange?.({
          target: { value: nextValue },
        } as React.ChangeEvent<HTMLSelectElement>)
      }}
    >
      <SelectTrigger
        aria-label={typeof caption === "string" ? caption : undefined}
        className="h-8 w-auto gap-1 border-input px-2 py-1 text-sm font-medium shadow-none focus:ring-1"
      >
        <SelectValue placeholder={typeof caption === "string" ? caption : undefined} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-60">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = false,
  captionLayout,
  components,
  labels,
  ...props
}: CalendarProps) {
  const useDropdownCaption =
    captionLayout === "dropdown" || captionLayout === "dropdown-buttons"

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      className={cn("p-3", className)}
      labels={{
        labelMonthDropdown: () => "Month",
        labelYearDropdown: () => "Year",
        ...labels,
      }}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "text-sm font-medium",
        caption_dropdowns: "flex items-center justify-center gap-2",
        dropdown_month: "relative inline-flex items-center",
        dropdown_year: "relative inline-flex items-center",
        vhidden: "sr-only",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell:
          "corner-squircle text-muted-foreground w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: cn(
          "corner-squircle h-9 w-9 p-0 text-center text-sm relative focus-within:relative focus-within:z-20",
          "[&:has([aria-selected].day-range-middle)]:rounded-none",
          "[&:has([aria-selected].day-range-start)]:rounded-l-md [&:has([aria-selected].day-range-start)]:rounded-r-none",
          "[&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-range-end)]:rounded-l-none",
          "[&:has([aria-selected].day-range-middle)]:bg-primary",
          "[&:has([aria-selected].day-range-start)]:bg-primary",
          "[&:has([aria-selected].day-range-end)]:bg-primary",
          "[&:has([aria-selected].day-outside)]:bg-primary/50",
        ),
        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100",
        ),
        day_range_start:
          "day-range-start rounded-l-md rounded-r-none bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_range_end:
          "day-range-end rounded-r-md rounded-l-none bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_range_middle:
          "day-range-middle rounded-none bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_selected:
          "rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today:
          "border border-dashed border-foreground/50 bg-transparent font-semibold aria-selected:border-transparent aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:opacity-100",
        day_outside:
          "day-outside text-muted-foreground aria-selected:bg-primary/50 aria-selected:text-primary-foreground",
        day_disabled: "text-muted-foreground opacity-50",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...iconProps }) => (
          <ChevronLeft className="h-4 w-4" {...iconProps} />
        ),
        IconRight: ({ ...iconProps }) => (
          <ChevronRight className="h-4 w-4" {...iconProps} />
        ),
        ...(useDropdownCaption ? { Dropdown: CalendarDropdown } : {}),
        ...components,
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
