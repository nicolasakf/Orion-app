/**
 * Sidebar accordion section chrome. One border on the card (not box-shadow) so
 * squircle corners stay crisp; the sticky header only fills the top — no separate
 * ring when expanded, so there is no line between header and content.
 */
export const SIDEBAR_ACCORDION_CARD =
  "corner-squircle rounded-md border border-sidebar-border bg-transparent";

/** Sticky header: same squircle radius as the card, no extra outline. */
export const SIDEBAR_ACCORDION_STICKY_HEADER =
  "corner-squircle sticky top-0 z-[1] bg-sidebar";
