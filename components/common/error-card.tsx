"use client";

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorCardProps {
  title?: string;
  message?: string;
  actionUrl?: string;
  actionLabel?: string;
  className?: string;
}

export function ErrorCard({
  title,
  message,
  actionUrl,
  actionLabel,
  className,
}: ErrorCardProps) {
  if (!message && !title) {
    return null;
  }

  return (
    <Alert
      variant="destructive"
      className={cn("bg-red-50 dark:bg-red-950/30", className)}
    >
      <AlertCircle className="h-4 w-4 dark:text-red-800" />
      {title && <AlertTitle className="dark:text-red-800">{title}</AlertTitle>}
      {message && (
        <AlertDescription className="space-y-2 dark:text-red-800">
          <p>{message}</p>
          {actionUrl && (
            <a
              href={actionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              {actionLabel ?? "Open account"}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </AlertDescription>
      )}
    </Alert>
  );
}
