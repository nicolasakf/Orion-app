"use client";

import { useMemo } from "react";
import { File } from "lucide-react";
import { getIcon } from "material-file-icons";

const ORION_LOGO_MASK = "url('/assets/Orion%20Logo_Black.svg')";

type FileIconProps = {
  filename: string;
  className?: string;
};

/**
 * Renders the Orion logo for Jupyter notebooks and a material-style SVG for other files.
 * Uses the `material-file-icons` package which maps ~377 file extensions/names to SVG icons.
 * Falls back to a generic Lucide File icon when no filename is provided.
 */
export function FileIcon({
  filename,
  className,
}: FileIconProps): React.JSX.Element {
  const isNotebook = filename.toLowerCase().endsWith(".ipynb");
  const svg = useMemo(() => {
    if (!filename || isNotebook) return null;
    return getIcon(filename).svg;
  }, [filename, isNotebook]);

  if (isNotebook) {
    return (
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 shrink-0 bg-[#ff4800] ${className || ""}`}
        style={{
          WebkitMaskImage: ORION_LOGO_MASK,
          maskImage: ORION_LOGO_MASK,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    );
  }

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
