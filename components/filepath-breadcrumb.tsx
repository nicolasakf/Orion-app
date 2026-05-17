"use client"

import * as React from "react";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu"
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { FileTree } from "./left-sidebar/file-tree"

export function FilePathBreadcrumb({ filepath, numSegments = 1 }: { filepath: string, numSegments?: number }) {
  const { effectiveSettings } = useOrionSettings();
  const fileTreeFontSize = effectiveSettings.fileTree.fontSize;
  const pathSegments = filepath.split("/").filter(Boolean);
  
  // Determine which segments to display
  let segmentsToRender: (string | null)[] = [...pathSegments];
  
  if (pathSegments.length > numSegments) {
    // Keep first segment, add null for ellipsis, and keep last two segments
    segmentsToRender = [
      null, // This will be rendered as ellipsis
      ...pathSegments.slice(-numSegments)
    ];
  }
  
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segmentsToRender.map((segment, index) => {
          if (segment === null) {
            return (
              <React.Fragment key="ellipsis">
                <BreadcrumbItem>
                  <BreadcrumbEllipsis />
                </BreadcrumbItem>
                <BreadcrumbSeparator />
              </React.Fragment>
            );
          }
          
          return (
            <BreadcrumbItem key={index}>
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1">
                  {segment}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <FileTree items={[]} fontSize={fileTreeFontSize} />
                </DropdownMenuContent>
              </DropdownMenu>
              {index < segmentsToRender.length - 1 && <BreadcrumbSeparator />}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
} 