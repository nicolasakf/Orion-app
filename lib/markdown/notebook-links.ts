/** True when a link should scroll within the rendered notebook document. */
export function isInternalNotebookAnchor(
  href: string | null | undefined,
): href is `#${string}` {
  return typeof href === "string" && href.startsWith("#") && href.length > 1;
}

/** True when a notebook link should leave Orion and open externally. */
export function shouldOpenNotebookLinkExternally(
  href: string | null | undefined,
): href is string {
  if (!href || isInternalNotebookAnchor(href)) {
    return false;
  }

  const trimmedHref = href.trim();
  if (!trimmedHref || trimmedHref.toLowerCase().startsWith("javascript:")) {
    return false;
  }

  if (/^(?:https?:|mailto:|tel:)/i.test(trimmedHref)) {
    return true;
  }

  return trimmedHref.startsWith("//");
}

/** Opens a notebook hyperlink in the user's default browser or mail client. */
export function openNotebookLinkExternally(href: string): void {
  window.open(href, "_blank", "noopener,noreferrer");
}

/** Intercepts rendered HTML anchor clicks so external links leave Orion. */
export function handleNotebookRenderedLinkClick(
  event: Pick<MouseEvent, "defaultPrevented" | "preventDefault" | "stopPropagation" | "target">,
): void {
  if (event.defaultPrevented) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const anchor = target.closest("a");
  if (!anchor) {
    return;
  }

  const href =
    anchor.getAttribute("href") ??
    anchor.getAttributeNS("http://www.w3.org/1999/xlink", "href") ??
    anchor.getAttribute("xlink:href");
  if (!shouldOpenNotebookLinkExternally(href)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  openNotebookLinkExternally(href);
}
