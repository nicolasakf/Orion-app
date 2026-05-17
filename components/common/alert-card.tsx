"use client";

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertCardProps {
  title?: string;
  message?: string;
  className?: string;
}

export function AlertCard({ title, message, className }: AlertCardProps) {
  if (!message && !title) {
    return null;
  }

  return (
    <Alert
      className={cn(
        "border-amber-500/50 bg-amber-500/5 text-amber-800 dark:text-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30 [&>svg]:!text-amber-800 dark:[&>svg]:!text-amber-200",
        className
      )}
    >
      <Info className="h-4 w-4" />
      {title && <AlertTitle>{title}</AlertTitle>}
      {message && <AlertDescription>{message}</AlertDescription>}
    </Alert>
  );
}
