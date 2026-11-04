/** The From the public inbox: its types, statuses and addresses. Pure. */

export const INBOX_TYPES = ["submissions", "reviews", "photos", "reports", "applications", "messages", "surveys"] as const;
export type InboxType = (typeof INBOX_TYPES)[number];
export type InboxView = InboxType | "all";

export const INBOX_VIEW_LABELS: Record<InboxView, string> = {
  all: "Everything",
  submissions: "Sent from the site",
  reviews: "Reviews",
  photos: "Photos",
  reports: "Reports",
  applications: "Applications",
  messages: "Messages",
  surveys: "Vendor survey",
};

/** One sentence per view, under its title. */
export const INBOX_VIEW_SENTENCES: Record<InboxView, string> = {
  all: "Everything people sent from the site, newest first. Waiting items are also on To do.",
  submissions: "Events people sent in. Waiting ones are decided on To do.",
  reviews: "What people wrote about events and markets. Approved reviews show on the site.",
  photos: "Pictures people added to events and markets. Shown photos appear on the site.",
  reports: "Problems people flagged on a listing.",
  applications: "Answers sent through the application forms.",
  messages: "Messages sent through the contact page.",
  surveys: "Answers to the vendor survey. Read only.",
};

/** URL status values. "waiting", "decided" and "all" work for every view. */
export type InboxStatus =
  | "waiting"
  | "decided"
  | "all"
  | "approved"
  | "rejected"
  | "resolved"
  | "dismissed"
  | "needs-info"
  | "duplicate"
  | "read"
  | "archived";

const STATUS_LABELS: Record<InboxStatus, string> = {
  waiting: "Waiting",
  decided: "Decided",
  all: "Everything",
  approved: "Approved",
  rejected: "Rejected",
  resolved: "Resolved",
  dismissed: "Dismissed",
  "needs-info": "Needs info",
  duplicate: "Duplicate",
  read: "Read",
  archived: "Archived",
};

/** The Show choices of each view, in order. Vendor survey answers have no status. */
export const VIEW_STATUSES: Record<InboxView, InboxStatus[]> = {
  all: ["waiting", "decided", "all"],
  submissions: ["waiting", "approved", "rejected", "all"],
  reviews: ["waiting", "approved", "rejected", "all"],
  photos: ["waiting", "approved", "rejected", "all"],
  reports: ["waiting", "resolved", "dismissed", "all"],
  applications: ["waiting", "needs-info", "approved", "rejected", "duplicate", "all"],
  messages: ["waiting", "read", "archived", "all"],
  surveys: ["all"],
};

export function statusLabel(view: InboxView, status: InboxStatus): string {
  if (view === "messages" && status === "waiting") return "Unread";
  if (view === "photos" && status === "approved") return "Showing";
  return STATUS_LABELS[status];
}

/** Database status values a URL status selects for a type; null selects every status. */
export function statusFilter(type: InboxType, status: InboxStatus): string[] | null {
  const waiting = "PENDING";
  if (status === "all" || type === "surveys") return null;
  if (status === "waiting") return [waiting];
  const decided: Record<InboxType, string[]> = {
    submissions: ["APPROVED", "REJECTED"],
    reviews: ["APPROVED", "REJECTED"],
    photos: ["APPROVED", "REJECTED"],
    reports: ["RESOLVED", "DISMISSED"],
    applications: ["APPROVED", "REJECTED", "NEEDS_INFO", "DUPLICATE"],
    messages: ["READ", "ARCHIVED"],
    surveys: [],
  };
  if (status === "decided") return decided[type];
  const one = status.toUpperCase().replace(/-/g, "_");
  return decided[type].includes(one) ? [one] : [waiting];
}

/** The status of a view in the URL: known for the view, else "all". */
export function parseStatus(view: InboxView, value: string | undefined): InboxStatus {
  const allowed = VIEW_STATUSES[view];
  return value && (allowed as string[]).includes(value) ? (value as InboxStatus) : "all";
}

export function parseView(value: string | undefined): InboxView {
  return value && (INBOX_TYPES as readonly string[]).includes(value) ? (value as InboxType) : "all";
}

/** An old page's status enum ("PENDING", "NEEDS_INFO") as an inbox status, or null. */
export function statusFromEnum(value: string | undefined | null): InboxStatus | null {
  const map: Record<string, InboxStatus> = {
    PENDING: "waiting",
    APPROVED: "approved",
    REJECTED: "rejected",
    RESOLVED: "resolved",
    DISMISSED: "dismissed",
    NEEDS_INFO: "needs-info",
    DUPLICATE: "duplicate",
    READ: "read",
    ARCHIVED: "archived",
  };
  return value ? (map[value.trim().toUpperCase()] ?? null) : null;
}

export type InboxParams = {
  view: InboxView;
  status: InboxStatus;
  q: string;
  /** Account id: reviews and photos by one person. */
  user: string;
  /** One item, opened from To do. */
  item: string;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseInboxParams(raw: RawParams): InboxParams {
  const view = parseView(one(raw.type));
  const page = Number.parseInt(one(raw.page) ?? "1", 10);
  const id = (value: string | undefined) => (value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : "");
  return {
    view,
    status: parseStatus(view, one(raw.status)),
    q: (one(raw.q) ?? "").trim().slice(0, 100),
    user: view === "reviews" || view === "photos" ? id(one(raw.user)) : "",
    item: view === "all" || view === "surveys" ? "" : id(one(raw.item)),
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 10_000) : 1,
  };
}

/** The address of an inbox view; defaults are left out. */
export function inboxHref(params: Partial<InboxParams> = {}): string {
  const q = new URLSearchParams();
  const view = params.view ?? "all";
  if (view !== "all") q.set("type", view);
  if (params.status && params.status !== "all") q.set("status", params.status);
  if (params.q) q.set("q", params.q);
  if (params.user) q.set("user", params.user);
  if (params.item) q.set("item", params.item);
  if (params.page && params.page > 1) q.set("page", String(params.page));
  const s = q.toString();
  return s ? `/admin/inbox?${s}` : "/admin/inbox";
}

/** One item on its own, with the list it was opened from as the way back. */
export function inboxItemHref(view: InboxType, id: string, back: string): string {
  return `${inboxHref({ view, item: id })}&back=${encodeURIComponent(back)}`;
}

/** The way back to an inbox list from a `back` address, or null unless it is an inbox list. */
export function inboxBack(value: string | undefined): { href: string; label: string } | null {
  if (!value || !/^\/admin\/inbox(\?|$)/.test(value)) return null;
  const query = new URLSearchParams(value.slice("/admin/inbox".length));
  if (query.has("item")) return null;
  const view = parseView(query.get("type") ?? undefined);
  return { href: value, label: view === "all" ? "Back to From the public" : `Back to ${INBOX_VIEW_LABELS[view]}` };
}

/** The inbox view each decision row type belongs to. */
export const ROW_VIEW: Partial<Record<string, InboxType>> = {
  submission: "submissions",
  review: "reviews",
  photo: "photos",
  report: "reports",
  application: "applications",
  message: "messages",
};

/** One public item on its own in the inbox, or null for a row type the inbox does not hold. */
export function publicItemHref(rowType: string, id: string): string | null {
  const view = ROW_VIEW[rowType];
  if (!view || view === "submissions") return null;
  return inboxHref({ view, item: id });
}

export const INBOX_PAGE_SIZE = 40;

/** Old pages that listed waiting items when the status was missing or unknown. */
const WAITING_BY_DEFAULT: ReadonlySet<InboxType> = new Set(["reviews", "photos", "reports"]);

/**
 * Where an old page (/admin/reviews, /admin/photos, ...) sends its address: the inbox view with
 * its status carried over (or the one the old page fell back to) and, for reviews and photos,
 * the person filter.
 */
export function legacyInboxHref(view: InboxType, raw: RawParams): string {
  const status = statusFromEnum(one(raw.status));
  const known = status && (VIEW_STATUSES[view] as string[]).includes(status) ? status : undefined;
  const allowed = known ?? (WAITING_BY_DEFAULT.has(view) ? "waiting" : undefined);
  const user = view === "reviews" || view === "photos" ? parseInboxParams({ type: view, user: raw.user }).user : "";
  return inboxHref({ view, status: allowed, user });
}

/** The old submissions list: waiting ones are decided on To do, the rest are in the inbox. */
export function legacySubmissionsHref(raw: RawParams): string {
  const status = one(raw.status)?.trim().toUpperCase();
  if (!status || status === "PENDING") return "/admin?lane=public";
  return legacyInboxHref("submissions", raw);
}
