"use client";

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorCardProps {
  title?: string;
  message?: string;
  className?: string;
}

export function ErrorCard({ title, message, className }: ErrorCardProps) {
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
        <AlertDescription className="dark:text-red-800">
          {message}
        </AlertDescription>
      )}
    </Alert>
  );
}
