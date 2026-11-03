export type AdminNavKey = "todo" | "events" | "markets" | "venues" | "vendors" | "site" | "more";

export type AdminNavSignalKey = "todo" | "markets" | "venues";

export type AdminNavItem = {
  key: AdminNavKey;
  label: string;
  href: string;
  /** Which honey dot from getNavSignals() this item carries. */
  signal?: AdminNavSignalKey;
};

/** The top bar items, in order. Screens without an item of their own (the rare screens) highlight none. */
export const ADMIN_NAV: readonly AdminNavItem[] = [
  { key: "todo", label: "To do", href: "/admin", signal: "todo" },
  { key: "events", label: "Events", href: "/admin/events" },
  { key: "markets", label: "Markets", href: "/admin/markets", signal: "markets" },
  { key: "venues", label: "Venues", href: "/admin/venues", signal: "venues" },
  { key: "vendors", label: "Vendors", href: "/admin/vendors" },
  { key: "site", label: "Site", href: "/admin/settings" },
];

/** The phone bottom bar. On phones, Vendors, Site and the color mode are reached through Jump. */
export const PHONE_NAV_KEYS: readonly AdminNavKey[] = ["todo", "events", "venues", "markets"];

/** Longest prefix wins; anything else under /admin belongs to More. */
const SECTION_PREFIXES: ReadonlyArray<readonly [string, AdminNavKey]> = [
  ["/admin/inbox", "todo"],
  ["/admin/submissions", "todo"],
  ["/admin/queues", "todo"],
  ["/admin/reviews", "todo"],
  ["/admin/photos", "todo"],
  ["/admin/reports", "todo"],
  ["/admin/applications", "todo"],
  ["/admin/applications/forms", "more"],
  ["/admin/events", "events"],
  ["/admin/markets", "markets"],
  ["/admin/venues", "venues"],
  ["/admin/neighborhoods", "venues"],
  ["/admin/vendors", "vendors"],
  ["/admin/site", "site"],
  ["/admin/settings", "site"],
  ["/admin/content", "site"],
  ["/admin/maintenance", "site"],
  ["/admin/promotions", "site"],
  ["/admin/marketing", "site"],
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function activeNavKey(pathname: string): AdminNavKey | null {
  if (pathname === "/admin" || pathname === "/admin/") return "todo";
  if (!matchesPrefix(pathname, "/admin")) return null;
  let best: { key: AdminNavKey; length: number } | null = null;
  for (const [prefix, key] of SECTION_PREFIXES) {
    if (matchesPrefix(pathname, prefix) && (!best || prefix.length > best.length)) {
      best = { key, length: prefix.length };
    }
  }
  return best?.key ?? "more";
}

/** The full rail sits on To do only; every other admin screen gets the slim rail. */
export function railVariant(pathname: string): "full" | "slim" {
  return pathname === "/admin" ? "full" : "slim";
}

/** Below 1024 px, To do and the Events list swap their rail for week chips. */
export function hasWeekChips(pathname: string): boolean {
  return pathname === "/admin" || pathname === "/admin/events";
}

/** Where a rail column links: To do filters its pile, every other screen filters Events. */
export function weekHref(pathname: string, weekKey: string): string {
  const base = pathname === "/admin" ? "/admin" : "/admin/events";
  return `${base}?week=${encodeURIComponent(weekKey)}`;
}
