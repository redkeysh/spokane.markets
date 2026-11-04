/**
 * What Jump finds without a search request: every admin page by its plain name and the words
 * people use for it, and the commands.
 */

export type JumpPage = {
  id: string;
  label: string;
  href: string;
  keywords: string[];
  /** One line under the label, when the page is not what the word suggests. */
  note?: string;
};

export type JumpCommandAction =
  | { type: "href"; href: string }
  | { type: "view-site" }
  | { type: "mode"; mode: "system" | "light" | "dark" }
  | { type: "single-keys"; on: boolean }
  | { type: "shortcuts" };

export type JumpCommand = {
  id: string;
  label: string;
  keywords: string[];
  action: JumpCommandAction;
};

export const JUMP_PAGES: readonly JumpPage[] = [
  { id: "todo", label: "To do", href: "/admin", keywords: ["home", "overview", "dashboard", "decisions", "pile", "queue", "this weekend"] },
  { id: "events", label: "Events", href: "/admin/events", keywords: ["listings", "catalog", "calendar"] },
  { id: "markets", label: "Markets", href: "/admin/markets", keywords: ["series", "seasons", "dates"] },
  { id: "venues", label: "Venues", href: "/admin/venues", keywords: ["places", "locations", "addresses"] },
  {
    id: "venue-duplicates",
    label: "Venues: duplicates",
    href: "/admin/venues?view=duplicates",
    keywords: ["merge", "duplicate places", "same place", "twins"],
  },
  { id: "neighborhoods", label: "Neighborhoods", href: "/admin/venues?view=neighborhood-list", keywords: ["areas", "area filter", "zip"] },
  { id: "vendors", label: "Vendors", href: "/admin/vendors", keywords: ["sellers", "makers", "profiles"] },
  {
    id: "site",
    label: "Site",
    href: "/admin/site",
    keywords: ["banner", "banners", "announcement", "homepage", "palette", "colors", "maintenance", "settings"],
  },
  {
    id: "featured",
    label: "Featured on the homepage",
    href: "/admin/promotions",
    keywords: ["promotions", "featured", "promote", "spotlight"],
  },
  { id: "graphics", label: "Graphics", href: "/admin/marketing/asset-studio", keywords: ["asset studio", "marketing", "images", "social"] },
  { id: "graphics-history", label: "Past graphics", href: "/admin/marketing/asset-studio/history", keywords: ["renders", "history"] },
  { id: "graphics-templates", label: "Graphics templates", href: "/admin/marketing/asset-studio/templates", keywords: ["templates"] },
  {
    id: "users",
    label: "Users",
    href: "/admin/users",
    keywords: ["people", "accounts", "roles", "permissions", "admins", "organizers"],
    note: "The permissions matrix is gone: only admins enter the admin, and they can do everything.",
  },
  { id: "subscribers", label: "Subscribers", href: "/admin/subscribers", keywords: ["newsletter", "emails", "mailing list"] },
  { id: "tags", label: "Tags and features", href: "/admin/tags", keywords: ["categories", "event types", "features"] },
  { id: "badges", label: "Community badges", href: "/admin/badges", keywords: ["badges"] },
  { id: "application-forms", label: "Application forms", href: "/admin/applications/forms", keywords: ["forms", "vendor applications"] },
  { id: "submissions", label: "Sent from the site", href: "/admin/submissions", keywords: ["submissions", "from the public", "submitted"] },
  { id: "reviews", label: "Reviews", href: "/admin/reviews", keywords: ["ratings", "from the public"] },
  { id: "photos", label: "Photos", href: "/admin/photos", keywords: ["pictures", "uploads", "from the public"] },
  { id: "reports", label: "Reports", href: "/admin/reports", keywords: ["flags", "complaints", "from the public"] },
  { id: "applications", label: "Applications", href: "/admin/applications", keywords: ["vendor applications", "from the public"] },
  { id: "data", label: "Import and export", href: "/admin/data", keywords: ["data", "csv", "import", "export", "backup"] },
  { id: "api-tokens", label: "API tokens", href: "/admin/api-tokens", keywords: ["tokens", "mcp", "claude", "api", "assistant"] },
  { id: "history", label: "History", href: "/admin/audit-log", keywords: ["audit log", "activity", "changes", "undo", "log"] },
  { id: "more", label: "More", href: "/admin/more", keywords: ["preferences", "directory", "rare", "settings"] },
  { id: "preferences", label: "Preferences", href: "/admin/more#preferences", keywords: ["color mode", "dark", "shortcuts", "keys"] },
];

export const JUMP_COMMANDS: readonly JumpCommand[] = [
  { id: "new-event", label: "New event", keywords: ["add event", "create event"], action: { type: "href", href: "/admin/events/new" } },
  { id: "new-market", label: "New market", keywords: ["add market", "create market"], action: { type: "href", href: "/admin/markets/new" } },
  {
    id: "edit-announcement",
    label: "Edit announcement",
    keywords: ["announcement bar", "banner message", "notice"],
    action: { type: "href", href: "/admin/site#announcement" },
  },
  {
    id: "merge-places",
    label: "Merge places",
    keywords: ["merge venues", "duplicates", "same place"],
    action: { type: "href", href: "/admin/venues?view=duplicates" },
  },
  { id: "view-site", label: "View site", keywords: ["public site", "open site", "homepage"], action: { type: "view-site" } },
  { id: "mode-dark", label: "Switch to dark mode", keywords: ["dark", "theme", "night"], action: { type: "mode", mode: "dark" } },
  { id: "mode-light", label: "Switch to light mode", keywords: ["light", "theme", "day"], action: { type: "mode", mode: "light" } },
  {
    id: "mode-system",
    label: "Follow the system color mode",
    keywords: ["system", "theme", "auto"],
    action: { type: "mode", mode: "system" },
  },
  {
    id: "keys-off",
    label: "Turn off single-key shortcuts",
    keywords: ["shortcuts", "keyboard", "hotkeys"],
    action: { type: "single-keys", on: false },
  },
  {
    id: "keys-on",
    label: "Turn on single-key shortcuts",
    keywords: ["shortcuts", "keyboard", "hotkeys"],
    action: { type: "single-keys", on: true },
  },
  {
    id: "shortcuts",
    label: "Show keyboard shortcuts",
    keywords: ["keys", "help", "cheat sheet", "?"],
    action: { type: "shortcuts" },
  },
];

/** Commands that would change nothing (the current mode, the current shortcut setting) are left out. */
export function availableCommands(
  commands: readonly JumpCommand[],
  state: { mode: "system" | "light" | "dark"; singleKeys: boolean }
): JumpCommand[] {
  return commands.filter((c) => {
    if (c.action.type === "mode") return c.action.mode !== state.mode;
    if (c.action.type === "single-keys") return c.action.on !== state.singleKeys;
    return true;
  });
}
