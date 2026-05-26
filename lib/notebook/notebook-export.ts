import type { ServerConnection } from "@jupyterlab/services";

export const NOTEBOOK_EXPORT_EVENT_NAME = "orion:notebook-export";

export const NOTEBOOK_EXPORT_OPTIONS = [
  { format: "html", label: "HTML", extension: "html" },
  { format: "pdf", label: "PDF", extension: "pdf" },
  { format: "markdown", label: "Markdown", extension: "md" },
  { format: "latex", label: "LaTeX", extension: "tex" },
] as const;

export type NotebookExportFormat =
  (typeof NOTEBOOK_EXPORT_OPTIONS)[number]["format"];

export interface NotebookExportEventDetail {
  format: NotebookExportFormat;
}

interface ScreenNotebookExportHtmlOptions {
  sourceElement: HTMLElement;
  title: string;
  autoPrint?: boolean;
}

const NOTEBOOK_EXPORT_FORMATS = new Set<string>(
  NOTEBOOK_EXPORT_OPTIONS.map((option) => option.format),
);

/** Standalone exports cannot rely on Next.js @font-face bundles; load Saira from Google Fonts. */
const EXPORT_SANS_FONT_FAMILY = "'Saira', sans-serif";
const EXPORT_SAIRA_FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Saira:ital,wght@0,100..900;1,100..900&display=swap";

/**
 * Returns true when an arbitrary value is one of Orion's supported notebook
 * export formats.
 */
export function isNotebookExportFormat(
  value: unknown,
): value is NotebookExportFormat {
  return typeof value === "string" && NOTEBOOK_EXPORT_FORMATS.has(value);
}

/**
 * Resolves the local file extension Orion should use for a notebook export.
 */
export function getNotebookExportExtension(
  format: NotebookExportFormat,
): string {
  return (
    NOTEBOOK_EXPORT_OPTIONS.find((option) => option.format === format)
      ?.extension ?? format
  );
}

/**
 * Resolves the human-facing label for a notebook export format.
 */
export function getNotebookExportLabel(format: NotebookExportFormat): string {
  return (
    NOTEBOOK_EXPORT_OPTIONS.find((option) => option.format === format)?.label ??
    format
  );
}

/**
 * Builds the downloaded filename for an exported notebook artifact.
 */
export function getNotebookExportFilename(
  filepath: string,
  format: NotebookExportFormat,
): string {
  const basename = filepath.split("/").filter(Boolean).pop() ?? "notebook";
  const notebookName = basename.replace(/\.ipynb$/i, "");
  return `${notebookName}.${getNotebookExportExtension(format)}`;
}

/**
 * Returns true when Orion should export the current rendered notebook DOM
 * instead of asking Jupyter nbconvert to render a separate document.
 */
export function isScreenRenderedNotebookExport(
  format: NotebookExportFormat,
): boolean {
  return format === "html" || format === "pdf";
}

/** Escapes user or notebook text before embedding it in standalone HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Converts relative CSS asset URLs to absolute URLs for downloaded exports. */
function absolutizeCssUrls(cssText: string, baseUrl: string): string {
  return cssText.replace(
    /url\((['"]?)(?!data:|blob:|https?:|file:|#)([^'")]+)\1\)/gi,
    (_match, _quote: string, rawUrl: string) => {
      try {
        return `url("${new URL(rawUrl, baseUrl).toString()}")`;
      } catch {
        return `url("${rawUrl}")`;
      }
    },
  );
}

/** Collects app stylesheets so exported HTML/PDF uses Orion's exact CSS. */
function collectDocumentStyleText(): string {
  const styleTexts: string[] = [];

  Array.from(document.styleSheets).forEach((styleSheet) => {
    const baseUrl = styleSheet.href ?? document.baseURI;

    try {
      const cssText = Array.from(styleSheet.cssRules)
        .map((rule) => rule.cssText)
        .join("\n");
      styleTexts.push(absolutizeCssUrls(cssText, baseUrl));
    } catch {
      if (styleSheet.href) {
        styleTexts.push(`@import url("${styleSheet.href}");`);
      }
    }
  });

  return styleTexts.join("\n\n");
}

/** Serializes computed CSS custom properties from the current theme root. */
function getRootCustomPropertyStyle(): string {
  const computedStyle = window.getComputedStyle(document.documentElement);

  return Array.from(computedStyle)
    .filter(
      (propertyName) =>
        propertyName.startsWith("--") && propertyName !== "--font-sans",
    )
    .map((propertyName) => {
      const value = computedStyle.getPropertyValue(propertyName).trim();
      return `${propertyName}: ${value};`;
    })
    .join(" ");
}

/** Preserves form control state in a cloned export DOM tree. */
function syncFormControlState(source: HTMLElement, clone: HTMLElement): void {
  const sourceInputs = source.querySelectorAll("input");
  const cloneInputs = clone.querySelectorAll("input");
  sourceInputs.forEach((input, index) => {
    const cloneInput = cloneInputs[index];
    if (!cloneInput) return;

    cloneInput.setAttribute("value", input.value);
    if (input.checked) {
      cloneInput.setAttribute("checked", "");
    } else {
      cloneInput.removeAttribute("checked");
    }
  });

  const sourceTextareas = source.querySelectorAll("textarea");
  const cloneTextareas = clone.querySelectorAll("textarea");
  sourceTextareas.forEach((textarea, index) => {
    const cloneTextarea = cloneTextareas[index];
    if (cloneTextarea) {
      cloneTextarea.textContent = textarea.value;
    }
  });

  const sourceSelects = source.querySelectorAll("select");
  const cloneSelects = clone.querySelectorAll("select");
  sourceSelects.forEach((select, selectIndex) => {
    const cloneSelect = cloneSelects[selectIndex];
    if (!cloneSelect) return;

    Array.from(cloneSelect.options).forEach((option) =>
      option.removeAttribute("selected"),
    );
    Array.from(select.selectedOptions).forEach((selectedOption) => {
      const option = cloneSelect.options[selectedOption.index];
      option?.setAttribute("selected", "");
    });
  });
}

/** Replaces clone canvases with image snapshots when the browser permits it. */
function snapshotCanvasElements(source: HTMLElement, clone: HTMLElement): void {
  const sourceCanvases = source.querySelectorAll("canvas");
  const cloneCanvases = clone.querySelectorAll("canvas");

  sourceCanvases.forEach((canvas, index) => {
    const cloneCanvas = cloneCanvases[index];
    if (!cloneCanvas) return;

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const image = document.createElement("img");
      const rect = canvas.getBoundingClientRect();

      image.src = dataUrl;
      image.alt = cloneCanvas.getAttribute("aria-label") ?? "Canvas output";
      image.className = cloneCanvas.className;
      image.style.cssText = cloneCanvas.getAttribute("style") ?? "";
      image.style.width = `${rect.width || canvas.width}px`;
      image.style.height = `${rect.height || canvas.height}px`;
      cloneCanvas.replaceWith(image);
    } catch {
      // Leave tainted canvases in place; other export content remains usable.
    }
  });
}

/** Removes live editor controls and transient state from the export clone. */
function cleanInteractiveNotebookChrome(clone: HTMLElement): void {
  clone
    .querySelectorAll(
      [
        '[role="tooltip"]',
        "[data-notebook-export-remove]",
        '[data-radix-popper-content-wrapper]',
        ".notebook-app-card-drag-handle",
        ".notebook-app-card-remove",
        ".monaco-editor textarea",
        ".monaco-editor .inputarea",
        ".monaco-editor .cursors-layer",
        ".monaco-editor .cursor",
        ".monaco-editor .view-overlays",
        ".monaco-editor .margin-view-overlays",
        ".react-resizable-handle",
      ].join(","),
    )
    .forEach((element) => element.remove());

  clone
    .querySelectorAll(
      [
        ".cell-cursor-active",
        ".ring-1",
        ".ring-2",
        ".ring-blue-500",
        ".ring-opacity-70",
        ".focus-visible\\:ring-2",
      ].join(","),
    )
    .forEach((element) => {
      element.classList.remove(
        "cell-cursor-active",
        "ring-1",
        "ring-2",
        "ring-blue-500",
        "ring-opacity-70",
        "focus-visible:ring-2",
      );
    });
}

/** Clones the rendered notebook DOM and preserves browser-only element state. */
function cloneRenderedNotebookElement(sourceElement: HTMLElement): HTMLElement {
  const clone = sourceElement.cloneNode(true) as HTMLElement;

  syncFormControlState(sourceElement, clone);
  snapshotCanvasElements(sourceElement, clone);
  cleanInteractiveNotebookChrome(clone);

  return clone;
}

/** Creates the browser script that opens the print dialog after assets settle. */
function getAutoPrintScript(): string {
  return `
    <script>
      (async () => {
        const imageSettles = Array.from(document.images).map((image) => {
          if (image.complete) return Promise.resolve();
          if (image.decode) return image.decode().catch(() => undefined);
          return new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        });
        await Promise.allSettled(imageSettles);
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready.catch(() => undefined);
        }
        window.setTimeout(() => {
          window.focus();
          window.print();
        }, 250);
      })();
    </script>
  `;
}

/**
 * Builds a standalone HTML document from the currently rendered Orion notebook
 * surface. This keeps HTML/PDF exports visually aligned with the editor.
 */
export function buildScreenNotebookExportHtml({
  sourceElement,
  title,
  autoPrint = false,
}: ScreenNotebookExportHtmlOptions): string {
  const clone = cloneRenderedNotebookElement(sourceElement);
  const rect = sourceElement.getBoundingClientRect();
  const computedBody = window.getComputedStyle(document.body);
  const computedRoot = window.getComputedStyle(document.documentElement);
  const rootCustomProperties = getRootCustomPropertyStyle();
  const styleText = collectDocumentStyleText();
  const htmlClassName = document.documentElement.className;
  const bodyClassName = document.body.className;
  const escapedTitle = escapeHtml(title);
  const exportWidth = Math.max(Math.ceil(rect.width), 320);
  const colorMode = document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";

  return `<!doctype html>
<html class="${escapeHtml(htmlClassName)}" data-color-mode="${colorMode}" style="${escapeHtml(rootCustomProperties)} --font-sans: ${EXPORT_SANS_FONT_FAMILY};">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${EXPORT_SAIRA_FONT_STYLESHEET}" />
  <style>${styleText}</style>
  <style>
    html {
      --font-sans: ${EXPORT_SANS_FONT_FAMILY};
      background: ${computedRoot.backgroundColor};
      height: auto !important;
      min-height: 100% !important;
      overflow: auto !important;
      overscroll-behavior: auto !important;
    }
    body {
      margin: 0;
      height: auto !important;
      min-height: 100vh;
      overflow: auto !important;
      overscroll-behavior: auto !important;
      background: ${computedBody.backgroundColor};
      color: ${computedBody.color};
      font-family: ${EXPORT_SANS_FONT_FAMILY};
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    .orion-screen-export-shell {
      min-height: 100vh !important;
      height: auto !important;
      overflow: visible !important;
      background: hsl(var(--sidebar));
      padding: 12px;
    }
    .orion-screen-export-content {
      width: ${exportWidth}px;
      max-width: 100%;
      margin: 0 auto;
      height: auto !important;
      min-height: auto !important;
      overflow: visible !important;
    }
    .orion-screen-export-content [data-notebook-export-root],
    .orion-screen-export-content .notebook-editor-content-area {
      height: auto !important;
      max-height: none !important;
      min-height: auto !important;
      overflow: visible !important;
    }
    .orion-screen-export-content .notebook-cell:focus,
    .orion-screen-export-content .notebook-cell:focus-visible,
    .orion-screen-export-content .notebook-editor-content-area:focus,
    .orion-screen-export-content .notebook-editor-content-area:focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
    .orion-screen-export-content button,
    .orion-screen-export-content [role="button"],
    .orion-screen-export-content [role="combobox"],
    .orion-screen-export-content [role="menu"],
    .orion-screen-export-content [role="menuitem"],
    .orion-screen-export-content [data-radix-popper-content-wrapper],
    .orion-screen-export-content .notebook-app-card-drag-handle,
    .orion-screen-export-content .notebook-app-card-remove,
    .orion-screen-export-content .monaco-editor textarea,
    .orion-screen-export-content .monaco-editor .inputarea,
    .orion-screen-export-content .monaco-editor .cursors-layer,
    .orion-screen-export-content .monaco-editor .cursor,
    .orion-screen-export-content .monaco-editor .view-overlays,
    .orion-screen-export-content .monaco-editor .margin-view-overlays,
    .orion-screen-export-content .react-resizable-handle {
      display: none !important;
    }
    .orion-screen-export-content .ring-1,
    .orion-screen-export-content .ring-2,
    .orion-screen-export-content .ring-blue-500,
    .orion-screen-export-content .cell-cursor-active {
      --tw-ring-color: transparent !important;
      --tw-ring-shadow: 0 0 #0000 !important;
    }
    .orion-screen-export-content .wmde-markdown,
    .orion-screen-export-content .wmde-markdown-var {
      font-family: var(--font-sans), sans-serif !important;
      --color-fg-default: hsl(var(--foreground)) !important;
      --color-fg-muted: hsl(var(--muted-foreground)) !important;
      --color-fg-subtle: hsl(var(--muted-foreground)) !important;
      --color-canvas-default: transparent !important;
      --color-canvas-subtle: hsl(var(--muted)) !important;
      --color-border-default: hsl(var(--border)) !important;
      --color-border-muted: hsl(var(--border)) !important;
      color: hsl(var(--foreground)) !important;
      background: transparent !important;
    }
    .orion-screen-export-content .wmde-markdown p,
    .orion-screen-export-content .wmde-markdown li,
    .orion-screen-export-content .wmde-markdown blockquote,
    .orion-screen-export-content .wmde-markdown td,
    .orion-screen-export-content .wmde-markdown th {
      color: inherit !important;
    }
    @media print {
      html,
      body {
        height: auto !important;
        overflow: visible !important;
        background: hsl(var(--sidebar)) !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .orion-screen-export-shell {
        min-height: auto;
        height: auto !important;
        overflow: visible !important;
        padding: 0;
      }
      .orion-screen-export-content {
        width: 100%;
        height: auto !important;
        overflow: visible !important;
      }
      @page {
        margin: 12mm;
      }
    }
  </style>
</head>
<body class="${escapeHtml(bodyClassName)}" data-color-mode="${colorMode}">
  <main class="orion-screen-export-shell">
    <div class="orion-screen-export-content">${clone.outerHTML}</div>
  </main>
  ${autoPrint ? getAutoPrintScript() : ""}
</body>
</html>`;
}

/**
 * Starts a download for a screen-rendered notebook HTML document.
 */
export function downloadScreenNotebookHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

/**
 * Opens a same-origin print window before async export work can lose the
 * browser's user-activation allowance.
 */
export function openScreenNotebookPrintWindow(title: string): Window | null {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    return null;
  }

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html>
<head><title>${escapeHtml(title)}</title></head>
<body style="font-family: system-ui, sans-serif; padding: 24px;">Preparing PDF export...</body>
</html>`);
  printWindow.document.close();
  return printWindow;
}

/**
 * Writes screen-rendered notebook HTML to a print window and triggers printing.
 */
export function printScreenNotebookHtml(
  printWindow: Window,
  html: string,
): void {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Builds a Jupyter nbconvert download URL.
 *
 * The nbconvert endpoint can reject browser `fetch` calls because it is not the
 * JSON Contents API, so exports are opened through a normal browser download.
 */
export function getNotebookExportUrl(
  serverSettings: ServerConnection.ISettings,
  filepath: string,
  format: NotebookExportFormat,
): string {
  const baseUrl = serverSettings.baseUrl.endsWith("/")
    ? serverSettings.baseUrl
    : `${serverSettings.baseUrl}/`;
  const encodedPath = filepath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const exportUrl = new URL(
    `nbconvert/${encodeURIComponent(format)}/${encodedPath}`,
    baseUrl,
  );

  exportUrl.searchParams.set("download", "true");
  if (serverSettings.token) {
    exportUrl.searchParams.set("token", serverSettings.token);
  }

  return exportUrl.toString();
}

/**
 * Starts a browser download from Jupyter's nbconvert endpoint.
 */
export function downloadNotebookExport(url: string, filename: string): void {
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
