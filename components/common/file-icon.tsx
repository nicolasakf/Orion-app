"use client";

import { useMemo } from "react";
import { File } from "lucide-react";
import { getIcon } from "material-file-icons";

type FileIconProps = {
  filename: string;
  className?: string;
};

/**
 * FileIcon component that renders a material-style SVG icon based on the file name.
 * Uses the `material-file-icons` package which maps ~377 file extensions/names to SVG icons.
 * Falls back to a generic Lucide File icon when no filename is provided.
 */
export function FileIcon({
  filename,
  className,
}: FileIconProps): React.JSX.Element {
  const svg = useMemo(() => {
    if (!filename) return null;
    return getIcon(filename).svg;
  }, [filename]);

  if (!svg) {
    return (
      <File
        className={`h-4 w-4 shrink-0 text-gray-600 ${className || ""}`}
      />
    );
  }

  return (
    <div
      className={`w-4 h-4 shrink-0 ${className || ""}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
