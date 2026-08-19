"use client";

import * as React from "react";
import { ArrowRight, Check, Plus, Search, X } from "lucide-react";

import { ToolLogo } from "@/components/onboarding/tool-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BUSINESS_TOOL_CATEGORIES,
  MAX_CUSTOM_TOOL_NAME_CHARS,
  MAX_CUSTOM_TOOLS_PER_CATEGORY,
  getBusinessToolsForCategory,
  searchBusinessTools,
  type BusinessStackCategorySelection,
  type BusinessStackSelection,
  type BusinessTool,
  type BusinessToolCategoryId,
} from "@/lib/onboarding/business-tools";
import { cn } from "@/lib/utils";

const EMPTY_ANSWER: BusinessStackCategorySelection = {
  toolIds: [],
  customTools: [],
  none: false,
};

interface ToolTileProps {
  tool: BusinessTool;
  selected: boolean;
  onToggle: (tool: BusinessTool) => void;
}

/** One selectable logo tile in the picker grid. */
const ToolTile = React.memo(function ToolTile({
  tool,
  selected,
  onToggle,
}: ToolTileProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={() => onToggle(tool)}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
        "hover:border-primary/50 hover:bg-accent/50",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-background",
      )}
    >
      <ToolLogo tool={tool} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{tool.name}</span>
      {selected ? <Check className="size-4 shrink-0 text-primary" aria-hidden /> : null}
    </button>
  );
});

/** One category's tiles plus its own free-text entries. */
interface ToolSection {
  category: (typeof BUSINESS_TOOL_CATEGORIES)[number];
  tools: BusinessTool[];
}

interface BusinessStackPickerProps {
  /** Answers restored from the persisted selection file. */
  value: BusinessStackSelection;
  /** Called on every change so the caller can persist progress. */
  onChange: (selection: BusinessStackSelection) => void;
  /** Called when the user is done picking and moves on to the interview. */
  onComplete: () => void;
  /** Called when the user abandons setup entirely. */
  onSkipAll?: () => void;
  className?: string;
}

/**
 * Single-screen "what does your company run on?" step of Business onboarding.
 *
 * Everything is on one page: search the whole catalog by name or narrow it with
 * the category dropdown, in any order, and leave whenever the list looks right.
 * Nothing is required, so a user who only recognises two tools is one search and
 * one click from finishing.
 */
export function BusinessStackPicker({
  value,
  onChange,
  onComplete,
  onSkipAll,
  className,
}: BusinessStackPickerProps) {
  const [query, setQuery] = React.useState("");
  /** `null` shows every category at once. */
  const [activeCategory, setActiveCategory] =
    React.useState<BusinessToolCategoryId | null>(null);
  /** Target for free-text entries while no category filter is applied. */
  const [customCategory, setCustomCategory] = React.useState<BusinessToolCategoryId>(
    BUSINESS_TOOL_CATEGORIES[0].id,
  );
  const searchInputRef = React.useRef<HTMLInputElement | null>(null);
  const trimmedQuery = query.trim();

  /** Ids selected anywhere, so tiles show their state under any filter. */
  const selectedIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const entry of Object.values(value.categories)) {
      for (const id of entry.toolIds) ids.add(id);
    }
    return ids;
  }, [value.categories]);

  /** Per-category selected totals shown in the category dropdown. */
  const countsByCategory = React.useMemo(() => {
    const counts = new Map<BusinessToolCategoryId, number>();
    for (const category of BUSINESS_TOOL_CATEGORIES) {
      const answer = value.categories[category.id];
      counts.set(
        category.id,
        (answer?.toolIds.length ?? 0) + (answer?.customTools.length ?? 0),
      );
    }
    return counts;
  }, [value.categories]);

  const selectedTotal = React.useMemo(
    () => [...countsByCategory.values()].reduce((total, count) => total + count, 0),
    [countsByCategory],
  );

  /**
   * Visible sections: the active category alone, or every category, each
   * narrowed by the search query. Empty sections drop out while searching so the
   * grid does not turn into a wall of headings.
   */
  const sections = React.useMemo<ToolSection[]>(() => {
    const categories = activeCategory
      ? BUSINESS_TOOL_CATEGORIES.filter((entry) => entry.id === activeCategory)
      : BUSINESS_TOOL_CATEGORIES;
    return categories
      .map((category) => ({
        category,
        tools: trimmedQuery
          ? searchBusinessTools(trimmedQuery, { category: category.id })
          : getBusinessToolsForCategory(category.id),
      }))
      .filter((section) => section.tools.length > 0 || !trimmedQuery);
  }, [activeCategory, trimmedQuery]);

  const matchCount = sections.reduce((total, section) => total + section.tools.length, 0);

  /** Replaces one category's answer and lifts the whole selection. */
  const writeAnswer = React.useCallback(
    (
      categoryId: BusinessToolCategoryId,
      update: (current: BusinessStackCategorySelection) => BusinessStackCategorySelection,
    ) => {
      const current = value.categories[categoryId] ?? EMPTY_ANSWER;
      onChange({
        ...value,
        categories: { ...value.categories, [categoryId]: update(current) },
        updatedAt: new Date().toISOString(),
      });
    },
    [onChange, value],
  );

  /** Adds or removes a catalog tool under its own category. */
  const toggleTool = React.useCallback(
    (tool: BusinessTool) => {
      writeAnswer(tool.category, (current) => {
        const has = current.toolIds.includes(tool.id);
        return {
          ...current,
          none: false,
          toolIds: has
            ? current.toolIds.filter((id) => id !== tool.id)
            : [...current.toolIds, tool.id],
        };
      });
    },
    [writeAnswer],
  );

  /** Records a tool the catalog does not know about. */
  const addCustomTool = React.useCallback(
    (name: string, categoryId: BusinessToolCategoryId) => {
      const normalized = name.trim().slice(0, MAX_CUSTOM_TOOL_NAME_CHARS);
      if (!normalized) return;
      writeAnswer(categoryId, (current) => {
        const duplicate = current.customTools.some(
          (existing) => existing.toLowerCase() === normalized.toLowerCase(),
        );
        if (duplicate || current.customTools.length >= MAX_CUSTOM_TOOLS_PER_CATEGORY) {
          return current;
        }
        return {
          ...current,
          none: false,
          customTools: [...current.customTools, normalized],
        };
      });
      setQuery("");
      searchInputRef.current?.focus();
    },
    [writeAnswer],
  );

  /** Removes one free-text entry. */
  const removeCustomTool = React.useCallback(
    (name: string, categoryId: BusinessToolCategoryId) => {
      writeAnswer(categoryId, (current) => ({
        ...current,
        customTools: current.customTools.filter((existing) => existing !== name),
      }));
    },
    [writeAnswer],
  );

  const addTarget = activeCategory ?? customCategory;
  const exactNameMatch = sections.some((section) =>
    section.tools.some((tool) => tool.name.toLowerCase() === trimmedQuery.toLowerCase()),
  );
  const canAddCustom = trimmedQuery.length > 0 && !exactNameMatch;
  const categoryFilterValue = activeCategory ?? "all";

  /** Formats one category option, including any selected-tool count. */
  const formatCategoryOptionLabel = React.useCallback(
    (category: (typeof BUSINESS_TOOL_CATEGORIES)[number]) => {
      const count = countsByCategory.get(category.id) ?? 0;
      if (count === 0) return category.label;
      return `${category.label} (${count === 1 ? "1 tool" : `${count} tools`})`;
    },
    [countsByCategory],
  );

  return (
    <div className={cn("flex min-h-0 flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {onSkipAll ? (
          <Button type="button" variant="ghost" size="sm" onClick={onSkipAll}>
            Skip setup
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {selectedTotal === 0
              ? "No tools selected yet"
              : `${selectedTotal} ${selectedTotal === 1 ? "tool" : "tools"} selected`}
          </span>
          <Button type="button" size="sm" onClick={onComplete}>
            Next
            <ArrowRight className="ml-2 size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canAddCustom && matchCount === 0) {
                event.preventDefault();
                addCustomTool(trimmedQuery, addTarget);
              }
            }}
            placeholder="Search for a tool by name — Slack, Salesforce, QuickBooks…"
            aria-label="Search tools"
            maxLength={MAX_CUSTOM_TOOL_NAME_CHARS}
            className="pl-9"
          />
        </div>
        <Select
          value={categoryFilterValue}
          onValueChange={(value) =>
            setActiveCategory(value === "all" ? null : (value as BusinessToolCategoryId))
          }
        >
          <SelectTrigger aria-label="Tool category" className="w-full shrink-0 sm:w-56">
            <SelectValue placeholder="All tools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {selectedTotal > 0 ? `All tools (${selectedTotal})` : "All tools"}
            </SelectItem>
            {BUSINESS_TOOL_CATEGORIES.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {formatCategoryOptionLabel(category)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto rounded-lg border p-3">
          {sections.map((section) => {
            const answer = value.categories[section.category.id] ?? EMPTY_ANSWER;
            return (
              <section key={section.category.id} className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="text-sm font-semibold">{section.category.label}</h4>
                  <p className="truncate text-xs text-muted-foreground">
                    {section.category.hint}
                  </p>
                </div>
                {section.tools.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {section.tools.map((tool) => (
                      <ToolTile
                        key={tool.id}
                        tool={tool}
                        selected={selectedIds.has(tool.id)}
                        onToggle={toggleTool}
                      />
                    ))}
                  </div>
                ) : null}
                {answer.customTools.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {answer.customTools.map((name) => (
                      <Badge
                        key={name}
                        variant="secondary"
                        className="gap-1 py-1 pl-2.5 pr-1.5"
                      >
                        {name}
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          onClick={() => removeCustomTool(name, section.category.id)}
                          className="rounded-full p-0.5 hover:bg-background/60"
                        >
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}

          {trimmedQuery && matchCount === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing in Orion&rsquo;s catalog matches &ldquo;{trimmedQuery}&rdquo;. Add
              it as your own below.
            </p>
          ) : null}

          {canAddCustom ? (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addCustomTool(trimmedQuery, addTarget)}
              >
                <Plus className="mr-2 size-4" />
                Add &ldquo;{trimmedQuery}&rdquo;
              </Button>
              {activeCategory === null ? (
                <>
                  <label htmlFor="custom-tool-category" className="text-sm text-muted-foreground">
                    under
                  </label>
                  <select
                    id="custom-tool-category"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={customCategory}
                    onChange={(event) =>
                      setCustomCategory(event.target.value as BusinessToolCategoryId)
                    }
                  >
                    {BUSINESS_TOOL_CATEGORIES.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </div>
          ) : null}
      </div>
    </div>
  );
}
