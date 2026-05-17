"use client";

import { useCallback, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export const ROLE_OPTIONS = [
  "Data Scientist",
  "Data Analyst",
  "Quantitative Analyst",
  "Business Analyst",
  "Academic Researcher",
  "Undergrad Student",
  "Grad Student",
] as const;

interface RoleComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
}

/** Role selector allowing both suggested and custom values. */
export function RoleCombobox({ value, onValueChange }: RoleComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = ROLE_OPTIONS.filter((option) =>
    option.toLowerCase().includes(search.toLowerCase())
  );
  const hasExactMatch = ROLE_OPTIONS.some(
    (option) => option.toLowerCase() === search.toLowerCase()
  );
  const showCustomOption = search.trim().length > 0 && !hasExactMatch;

  const handleSelect = useCallback(
    (selected: string) => {
      onValueChange(selected);
      setOpen(false);
      setSearch("");
    },
    [onValueChange]
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && search.trim().length > 0 && !hasExactMatch) {
        onValueChange(search.trim());
      }
      setOpen(nextOpen);
      if (!nextOpen) setSearch("");
    },
    [hasExactMatch, onValueChange, search]
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground"
          )}
        >
          {value || "Select or type your role"}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type custom..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => handleSelect(option)}
                >
                  {option}
                </CommandItem>
              ))}
              {showCustomOption && (
                <CommandItem
                  value={`__custom__${search.trim()}`}
                  onSelect={() => handleSelect(search.trim())}
                >
                  Use &quot;{search.trim()}&quot;
                </CommandItem>
              )}
            </CommandGroup>
            <CommandEmpty>No role found.</CommandEmpty>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
