/** Lowercase letters and digits in words joined by single hyphens, as produced by slugify. */
export const EVENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const EVENT_SLUG_MAX_LENGTH = 120;

/** Static routes beside /events/[slug]; an event with one of these slugs could never be reached. */
export const RESERVED_EVENT_SLUGS: ReadonlySet<string> = new Set(["calendar", "map"]);
