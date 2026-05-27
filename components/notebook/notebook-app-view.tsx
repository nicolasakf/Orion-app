"use client";

import React, { useMemo } from "react";
import { AlertTriangle, LayoutTemplate } from "lucide-react";

import { NotebookAppSchemaView } from "@/components/notebook/notebook-app-schema-view";
import type { OrionUiLocalValue } from "@/components/notebook/orion-ui-primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseNotebookAppViewSchema } from "@/lib/notebook/app-view";
import { cn } from "@/lib/utils";
import { type NotebookType } from "@/lib/types";

interface NotebookAppViewProps {
  notebook: NotebookType;
  onNotebookViewRequest?: () => void;
  onOrionUiStateChange?: (
    key: string,
    value: OrionUiLocalValue,
    outputId?: string,
  ) => void;
  onOrionUiAction?: (action: unknown) => void;
}

function AppViewSchemaError({
  errors,
  onNotebookViewRequest,
}: {
  errors: string[];
  onNotebookViewRequest?: () => void;
}): React.JSX.Element {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center p-6"
      data-notebook-export-root="app"
    >
      <Card className="max-w-xl p-5">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground">
              App View schema could not be rendered
            </h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {errors.map((error, index) => (
                <li key={`${error}-${index}`}>{error}</li>
              ))}
            </ul>
            {onNotebookViewRequest ? (
              <Button
                type="button"
                variant="link"
                className="mt-4 h-auto p-0 text-sm"
                onClick={onNotebookViewRequest}
              >
                Back to Notebook View
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

/**
 * Renders the declarative notebook App View schema.
 */
export function NotebookAppView({
  notebook,
  onNotebookViewRequest,
  onOrionUiStateChange,
  onOrionUiAction,
}: NotebookAppViewProps): React.JSX.Element {
  const schemaResult = useMemo(
    () => parseNotebookAppViewSchema(notebook.metadata),
    [notebook.metadata],
  );

  if (schemaResult.status === "valid") {
    return (
      <NotebookAppSchemaView
        notebook={notebook}
        schema={schemaResult.schema}
        onOrionUiStateChange={onOrionUiStateChange}
        onOrionUiAction={onOrionUiAction}
      />
    );
  }

  if (schemaResult.status === "invalid") {
    return (
      <AppViewSchemaError
        errors={schemaResult.errors}
        onNotebookViewRequest={onNotebookViewRequest}
      />
    );
  }

  return (
    <div
      className="flex min-h-[60vh] items-center justify-center p-6"
      data-notebook-export-root="app"
    >
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <LayoutTemplate className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-medium text-foreground mt-2">
          No cells in App View
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          From Notebook view, right-click a cell or output and choose
        </p>
        <div
          className={cn(
            "corner-squircle mx-auto mt-3 w-fit",
            "bg-popover text-popover-foreground rounded-md border p-1 shadow-md",
          )}
        >
          <div
            className={cn(
              "corner-squircle relative flex cursor-default select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-hidden",
              "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              "[&_svg:not([class*='text-'])]:text-muted-foreground",
            )}
          >
            <LayoutTemplate className="mr-2 h-4 w-4" />
            Add to App View
          </div>
        </div>
        {onNotebookViewRequest ? (
          <Button
            type="button"
            variant="link"
            className="mt-2 h-auto p-0 text-sm"
            onClick={onNotebookViewRequest}
          >
            Back to Notebook View
          </Button>
        ) : null}
      </div>
    </div>
  );
}
