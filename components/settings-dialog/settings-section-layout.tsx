"use client";

import type { ReactNode } from "react";

interface SettingsSectionLayoutProps {
  title: string;
  /** Optional helper text shown below the section title (not as an info icon). */
  description?: string;
  children: ReactNode;
}

/** Shared header and content wrapper for settings dialog sections. */
export function SettingsSectionLayout({
  title,
  description,
  children,
}: SettingsSectionLayoutProps) {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
