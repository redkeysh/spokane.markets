/** DBA (display name) used across the site. */
export const SITE_NAME = "Spokane Markets";

/**
 * Default image for link previews (Open Graph / Twitter / iMessage, etc.).
 * Place your logo or branded artwork at this path under `public/` (e.g. `public/og.png`).
 * Aim for ~1200×630 (or 1.91:1); square logos work but may be letterboxed on some platforms.
 */
export const SITE_OG_IMAGE_PATH = "/og.png";

/** Legal entity for Terms, Privacy, copyright. */
export const LEGAL_ENTITY = "Spokane Market Hive, LLC";

/** Legal entity with DBA for formal legal text. */
export const LEGAL_ENTITY_WITH_DBA = "Spokane Market Hive, LLC, doing business as Spokane Markets";

/**
 * Shared style for compact "pill" action links and buttons (44px touch target,
 * bordered, with a themed focus-visible ring). Used for dashboard quick-links
 * and the profile form's inline actions.
 */
export const ACTION_PILL_CLASS =
  "inline-flex min-h-[44px] items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const DATE_FILTERS = [
  { label: "Today", value: "today" },
  { label: "This Weekend", value: "weekend" },
  { label: "Next 7 Days", value: "week" },
  { label: "2–4 Weeks Out", value: "plan-ahead" },
  { label: "This Month", value: "month" },
  { label: "All Upcoming", value: "all" },
] as const;

export type DateFilterValue = (typeof DATE_FILTERS)[number]["value"];
