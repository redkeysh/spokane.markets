import type { Prisma } from "@prisma/client";
import { formatAuditEntry } from "@/lib/audit/labels";
import { marketHistorySentence } from "@/lib/markets/page-view";
import { addDays, formatDay, formatTimeRange, formatTimestamp, pacificDate, startOfPacificDay } from "./format";
import { metaOf, type AuditRow } from "./undo";

export type HistoryAuditRow = AuditRow & { userId: string | null; user: { name: string | null; email: string } | null };

export type HistoryWhat = "anything" | "publishing" | "rejecting" | "editing" | "merging" | "settings";
export type HistoryWhen = "today" | "7" | "30" | "90" | "all";

/** `who` is "anyone", "you", "tokens" or a person's user id. */
export type HistoryFilters = { q: string; what: HistoryWhat; who: string; when: HistoryWhen };

/** Where the next page of History starts: the oldest row shown so far. */
export type HistoryCursor = { at: string; id: string };

export type HistoryRecord = { title: string; href: string | null };

export type HistoryDetail = { label: string; before: string | null; after: string | null };

/** Names of the people whose accounts audit rows changed, by user id. */
export type AccountNames = ReadonlyMap<string, string>;

/** A sentence and the record it names, linked in place. */
export type RowSentence = { sentence: string; link: HistoryRecord | null };

export const RECORD_HREFS: Record<string, (id: string) => string> = {
  EVENT: (id) => `/admin/events/${id}`,
  VENUE: (id) => `/admin/venues/${id}`,
  MARKET: (id) => `/admin/markets/${id}`,
  SUBMISSION: (id) => `/admin/submissions/${id}`,
  USER: (id) => `/admin/users/${id}`,
  VENDOR_PROFILE: (id) => `/admin/vendors/${id}`,
};

/** The admin page of the record an audit row changed, when there is one. */
export function recordHref(row: Pick<AuditRow, "targetType" | "targetId">): string | null {
  return row.targetType && row.targetId && RECORD_HREFS[row.targetType] ? RECORD_HREFS[row.targetType](row.targetId) : null;
}

const FIELD_WORDS: Record<string, string> = {
  title: "title",
  slug: "web address",
  description: "description",
  status: "status",
  venueId: "place",
  marketId: "market",
  websiteUrl: "website",
  facebookUrl: "Facebook link",
  instagramUrl: "Instagram link",
  imageUrl: "picture",
  showImageInList: "picture on cards",
  imageFocalX: "picture focus",
  imageFocalY: "picture focus",
  complianceNotes: "notes",
  complianceFlagged: "flag",
  tagIds: "tags",
  featureIds: "features",
  scheduleDays: "dates and hours",
  startDate: "dates and hours",
  endDate: "dates and hours",
};

const STATUS_VERBS: Record<string, string> = {
  PUBLISHED: "published",
  REJECTED: "rejected",
  CANCELLED: "marked as cancelled",
  DRAFT: "moved back to draft",
  PENDING: "moved back to waiting",
};

export function actorOf(entry: HistoryAuditRow, viewerId?: string | null): string {
  const meta = entry.metadata as { via?: string; tokenName?: string } | null;
  if (meta?.via === "mcp" && meta.tokenName) return `${meta.tokenName} (API token)`;
  if (viewerId && entry.userId === viewerId) return "You";
  return entry.user?.name?.trim() || entry.user?.email || "Someone";
}

/** Status changes, edits, memos and submissions in words; everything else in the shared audit labels. */
function describeCommon(entry: HistoryAuditRow, viewerId?: string | null): { sentence: string; href: string | null } {
  const actor = actorOf(entry, viewerId);
  const meta = metaOf(entry);
  const title = meta.details?.title ?? null;
  const name = title ?? "a record";
  const href = recordHref(entry);
  const next = meta.newValue ?? {};
  const reason = (meta.details as { reason?: string } | undefined)?.reason;

  switch (entry.action) {
    case "UPDATE_EVENT": {
      const fields = Object.keys(next);
      if (typeof next.status === "string" && fields.every((f) => f === "status" || f === "complianceNotes")) {
        return { sentence: `${actor} ${STATUS_VERBS[next.status] ?? "changed the status of"} ${name}${reason ? `: ${reason}` : ""}.`, href };
      }
      const words = [...new Set(fields.map((f) => FIELD_WORDS[f] ?? f))];
      return { sentence: `${actor} changed ${name}${words.length ? `: ${words.join(", ")}` : ""}.`, href };
    }
    case "SOFT_DELETE_EVENT":
      return { sentence: `${actor} archived ${name}${next.duplicateOfId ? " as a duplicate" : ""}.`, href };
    case "RESTORE_EVENT":
      return { sentence: `${actor} restored ${name}.`, href };
    case "UNDO_DECISION":
      return { sentence: `${actor} undid a decision; ${name} is back as it was.`, href };
    case "CREATE_MARKET":
      return { sentence: `${actor} made the market ${name}.`, href };
    case "UPDATE_SUBMISSION":
      return { sentence: `${actor} edited the submission ${name}.`, href };
    case "UPDATE_SUBMISSION_STATUS": {
      const what = title ?? "a submission";
      if (next.status === "APPROVED") {
        const eventId = typeof next.createdEventId === "string" ? next.createdEventId : null;
        return { sentence: `${actor} published ${what}.`, href: eventId ? RECORD_HREFS.EVENT(eventId) : href };
      }
      if (next.status === "REJECTED") return { sentence: `${actor} rejected ${what}${reason ? `: ${reason}` : ""}.`, href };
      break;
    }
    case "DELETE_ADMIN_MEMO": {
      const kind = meta.previousValue?.kind;
      if (kind === "later") return { sentence: `${actor} brought back ${title ?? "a decision"}.`, href: null };
      if (kind === "not-same-event") return { sentence: `${actor} took back marking two events as different.`, href: null };
      if (kind === "not-same-place") return { sentence: `${actor} took back marking two places as different.`, href: null };
      if (kind === "same-place") return { sentence: `${actor} took back marking two places as the same.`, href: null };
      break;
    }
    case "SET_ADMIN_MEMO": {
      const kind = next.kind;
      if (kind === "later" && typeof next.until === "string") {
        return { sentence: `${actor} put off ${title ?? "a decision"} until ${formatDay(pacificDate(new Date(next.until)))}.`, href: null };
      }
      if (kind === "not-same-event") return { sentence: `${actor} marked two events as different.`, href: null };
      if (kind === "not-same-place") return { sentence: `${actor} marked two places as different.`, href: null };
      if (kind === "same-place") return { sentence: `${actor} marked two places as the same.`, href: null };
      break;
    }
  }
  const fallback = formatAuditEntry({
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    metadata: entry.metadata,
    user: { name: actor, email: "" },
  });
  return { sentence: `${fallback.message}${title ? `: ${title}` : ""}.`, href: href ?? fallback.href };
}

function titleOf(row: HistoryAuditRow): string | null {
  const meta = metaOf(row) as { details?: { title?: string } } & Record<string, unknown>;
  const title = meta.details?.title ?? (typeof meta.title === "string" ? meta.title : null);
  return title?.trim() || null;
}

/** The record an audit row changed, named and linked, or null when the row names none. */
export function recordOf(row: HistoryAuditRow): HistoryRecord | null {
  const title = titleOf(row);
  return title ? { title, href: recordHref(row) } : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

const ARCHIVE_NOUNS: Record<string, { noun: string; href?: (id: string) => string }> = {
  VENUE: { noun: "place", href: RECORD_HREFS.VENUE },
  MARKET: { noun: "market", href: RECORD_HREFS.MARKET },
  VENDOR_PROFILE: { noun: "vendor", href: RECORD_HREFS.VENDOR_PROFILE },
};

const NO_NAMES: AccountNames = new Map();

/**
 * One audit row as a sentence, with the record it names linked in place. `accounts` names the
 * people whose accounts were changed.
 */
export function describeRow(row: HistoryAuditRow, viewerId: string | null, accounts: AccountNames = NO_NAMES): RowSentence {
  const meta = (metaOf(row) ?? {}) as Record<string, unknown> & {
    previousValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
  };
  const actor = actorOf(row, viewerId);
  const title = titleOf(row);
  const target = recordHref(row);
  const linked = (sentence: string, name: string | null, href: string | null = target): RowSentence => ({
    sentence,
    link: name && href && sentence.includes(name) ? { title: name, href } : null,
  });

  switch (row.action) {
    case "MERGE_VENUES": {
      const merged = Array.isArray(meta.mergedNames) ? meta.mergedNames.length : Array.isArray(meta.mergedIds) ? meta.mergedIds.length : 0;
      const moved = typeof meta.eventsMoved === "number" ? meta.eventsMoved : 0;
      const into = title ?? "another place";
      const what = merged > 0 ? plural(merged, "place", "places") : "places";
      return linked(`${actor} merged ${what} into ${into}.${moved > 0 ? ` ${plural(moved, "event", "events")} moved.` : ""}`, title);
    }
    case "CREATE_EVENT":
      return linked(`${actor} added ${title ?? "an event"}.`, title);
    case "UPDATE_MARKET": {
      const sentence = marketHistorySentence({ action: row.action, actor, title, newValue: meta.newValue ?? null });
      if (sentence) return linked(sentence, title);
      break;
    }
    case "CREATE_API_TOKEN": {
      const name = asText(meta.name);
      const access = meta.access === "WRITE" ? ", read and write" : meta.access === "READ" ? ", read only" : "";
      return linked(`${actor} made the API token ${name ?? "with no name"}${access}.`, name, "/admin/api-tokens");
    }
    case "REVOKE_API_TOKEN": {
      const name = asText(meta.name);
      return linked(`${actor} revoked the API token ${name ?? "with no name"}.`, name, "/admin/api-tokens");
    }
    case "UPDATE_USER":
    case "UPDATE_USER_ROLE": {
      const before = meta.previousValue ?? {};
      const after = meta.newValue ?? {};
      const role = asText(after.role) ?? asText(meta.newRole);
      const changes = [
        role && role !== before.role ? `role to ${(ENUM_WORDS[role] ?? role).toLowerCase()}` : null,
        typeof after.accountStatus === "string" && after.accountStatus !== before.accountStatus
          ? `account to ${(ENUM_WORDS[after.accountStatus] ?? after.accountStatus).toLowerCase()}`
          : null,
      ].filter(Boolean);
      const person = row.targetId ? (accounts.get(row.targetId) ?? null) : null;
      const whose = person ? `the account of ${person}` : "an account";
      return linked(`${actor} changed ${whose}${changes.length ? `: ${changes.join(", ")}` : ""}.`, person);
    }
    case "DELETE_USER": {
      const email = asText(meta.previousValue?.email);
      return linked(`${actor} deleted the account of ${email ?? "someone"}.`, null);
    }
    case "UPDATE_MAINTENANCE_MODE": {
      const mode = asText(meta.mode);
      return linked(`${actor} set maintenance mode to ${mode ? mode.toLowerCase().replace(/_/g, " ") : "a new setting"}.`, null);
    }
    case "UPDATE_ADMIN_PERMISSION_MATRIX":
      return linked(`${actor} changed the old permission settings.`, null);
    case "DELETE_PROMOTION":
      return linked(`${actor} took an entry off the homepage.`, null);
    case "SOFT_DELETE_VENUE":
    case "SOFT_DELETE_MARKET":
    case "SOFT_DELETE_VENDOR":
    case "RESTORE_VENUE":
    case "RESTORE_MARKET":
    case "RESTORE_VENDOR": {
      const kind = ARCHIVE_NOUNS[row.targetType ?? ""];
      if (!kind) break;
      const name = title ?? `a ${kind.noun}`;
      const verb = row.action.startsWith("RESTORE") ? "restored" : "archived";
      const href = row.targetId && kind.href ? kind.href(row.targetId) : null;
      return linked(`${actor} ${verb} ${title ? `the ${kind.noun} ${title}` : name}.`, name, href);
    }
  }
  const common = describeCommon(row, viewerId);
  return linked(common.sentence, title, common.href);
}

/** One audit entry as a plain sentence, in the owner's words, and the record's admin page. */
export function describeAuditEntry(
  entry: HistoryAuditRow,
  viewerId?: string | null,
  accounts: AccountNames = NO_NAMES
): { sentence: string; href: string | null } {
  const { sentence, link } = describeRow(entry, viewerId ?? null, accounts);
  return { sentence, href: link?.href ?? describeCommon(entry, viewerId).href };
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  eventTitle: "Title",
  slug: "Web address",
  description: "Description",
  status: "Status",
  venueId: "Place",
  marketId: "Market",
  websiteUrl: "Website",
  facebookUrl: "Facebook link",
  instagramUrl: "Instagram link",
  imageUrl: "Picture",
  showImageInList: "Picture on cards",
  imageFocalX: "Picture focus across",
  imageFocalY: "Picture focus down",
  complianceNotes: "Notes",
  complianceFlagged: "Flagged",
  tagIds: "Tags",
  featureIds: "Features",
  scheduleDays: "Dates and hours",
  startDate: "Starts",
  endDate: "Ends",
  deletedAt: "Archived",
  duplicateOfId: "Same event as",
  createdEventId: "Event it made",
  name: "Name",
  address: "Address",
  city: "City",
  state: "State",
  zip: "ZIP",
  neighborhood: "Neighborhood",
  role: "Role",
  newRole: "Role",
  accountStatus: "Account status",
  access: "Access",
  expiresAt: "Expires",
  mode: "Mode",
  messageTitle: "Message title",
  kind: "Kind",
  until: "Until",
  mergedNames: "Merged",
  eventsMoved: "Events moved",
  marketsMoved: "Markets moved",
  email: "Email",
};

/** Keys that describe the entry rather than the record. */
const HIDDEN_KEYS = new Set(["details", "via", "tokenId", "tokenName", "previousValue", "newValue", "moved", "mergedIds"]);

const ENUM_WORDS: Record<string, string> = {
  PUBLISHED: "Published",
  PENDING: "Pending",
  DRAFT: "Draft",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  APPROVED: "Approved",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  BANNED: "Banned",
  DEACTIVATED: "Deactivated",
  READ: "Read only",
  WRITE: "Read and write",
  ADMIN: "Admin",
  USER: "User",
  VENDOR: "Vendor",
  ORGANIZER: "Organizer",
  DISMISSED: "Dismissed",
  RESOLVED: "Resolved",
};

export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MAX_TEXT = 240;

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

type ScheduleDay = { date?: unknown; startTime?: unknown; endTime?: unknown; allDay?: unknown };

function scheduleDayText(day: ScheduleDay, now: Date): string {
  const date = typeof day.date === "string" ? formatDay(day.date.slice(0, 10), now) : "A day";
  if (day.allDay) return `${date}, all day`;
  if (typeof day.startTime === "string" && typeof day.endTime === "string") {
    return `${date}, ${formatTimeRange(day.startTime, day.endTime)}`;
  }
  return date;
}

/** A raw previous or new value as words. null means none. */
export function formatValue(key: string, value: unknown, now: Date = new Date()): string | null {
  if (key === "deletedAt") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (ENUM_WORDS[value]) return ENUM_WORDS[value];
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      const instant = new Date(value);
      if (!Number.isNaN(instant.getTime())) return formatTimestamp(instant);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDay(value, now);
    return clip(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    if (key === "scheduleDays") {
      const days = value.map((d) => scheduleDayText((d ?? {}) as ScheduleDay, now));
      const shown = days.slice(0, 3).join("; ");
      return days.length > 3 ? `${shown}; and ${days.length - 3} more days` : shown;
    }
    if (value.every((v) => typeof v === "string")) {
      if (key.endsWith("Ids")) return `${value.length} chosen`;
      return clip(value.join(", "));
    }
    return `${value.length} items`;
  }
  if (typeof value === "object") {
    const parts = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const text = formatValue(k, v, now);
        return text === null ? null : `${fieldLabel(k).toLowerCase()} ${text}`;
      })
      .filter(Boolean);
    return parts.length ? clip(parts.join(", ")) : null;
  }
  return clip(String(value));
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The previous and new values of one audit row, field by field. */
export function rowDetails(row: HistoryAuditRow, now: Date = new Date()): HistoryDetail[] {
  const meta = asRecord(row.metadata) ?? {};
  const before = asRecord(meta.previousValue);
  const after = asRecord(meta.newValue);
  const rows: HistoryDetail[] = [];
  const seen = new Set<string>();
  if (before || after) {
    for (const key of [...Object.keys(before ?? {}), ...Object.keys(after ?? {})]) {
      const label = fieldLabel(key);
      if (seen.has(label)) continue;
      seen.add(label);
      rows.push({ label, before: formatValue(key, before?.[key], now), after: formatValue(key, after?.[key], now) });
    }
  }
  for (const [key, value] of Object.entries(meta)) {
    if (HIDDEN_KEYS.has(key)) continue;
    const label = fieldLabel(key);
    if (seen.has(label)) continue;
    seen.add(label);
    rows.push({ label, before: null, after: formatValue(key, value, now) });
  }
  return rows;
}

const MAX_DETAIL_ROWS = 40;

function sameOrEither(values: readonly (string | null)[]): string | null {
  const unique = [...new Set(values.map((v) => v ?? "None"))];
  if (unique.length === 1) return unique[0] === "None" ? null : unique[0];
  return unique.length <= 3 ? unique.join(" or ") : `${unique.slice(0, 3).join(", ")} and others`;
}

/**
 * Details for one or more rows: field by field for one row. A decision over several records lists
 * each field once, with the values its records had ("Pending or Draft").
 */
export function groupDetails(group: readonly HistoryAuditRow[], now: Date = new Date()): HistoryDetail[] {
  if (group.length === 1) return rowDetails(group[0], now);
  const byLabel = new Map<string, { before: (string | null)[]; after: (string | null)[] }>();
  for (const row of group) {
    for (const detail of rowDetails(row, now)) {
      const entry = byLabel.get(detail.label) ?? { before: [], after: [] };
      entry.before.push(detail.before);
      entry.after.push(detail.after);
      byLabel.set(detail.label, entry);
    }
  }
  return [...byLabel.entries()]
    .slice(0, MAX_DETAIL_ROWS)
    .map(([label, values]) => ({ label, before: sameOrEither(values.before), after: sameOrEither(values.after) }));
}

/** The first moment the When filter lets through, at Pacific midnight; null for Any time. */
export function historySince(when: HistoryWhen, now: Date): Date | null {
  if (when === "all") return null;
  const today = pacificDate(now);
  const days = when === "today" ? 0 : Number(when) - 1;
  return startOfPacificDay(addDays(today, -days));
}

const STATUS_ACTIONS = [
  "UPDATE_SUBMISSION_STATUS",
  "BULK_UPDATE_SUBMISSION_STATUS",
  "UPDATE_REVIEW_STATUS",
  "BULK_UPDATE_REVIEW_STATUS",
  "UPDATE_PHOTO_STATUS",
  "BULK_UPDATE_PHOTO_STATUS",
  "UPDATE_CLAIM_STATUS",
  "UPDATE_VENDOR_CLAIM_STATUS",
];

const EDIT_ACTIONS = [
  "UPDATE_EVENT",
  "CREATE_EVENT",
  "DELETE_EVENT",
  "SOFT_DELETE_EVENT",
  "RESTORE_EVENT",
  "UPDATE_VENUE",
  "SOFT_DELETE_VENUE",
  "RESTORE_VENUE",
  "CREATE_MARKET",
  "SOFT_DELETE_MARKET",
  "RESTORE_MARKET",
  "ADD_MARKET_MEMBER",
  "REMOVE_MARKET_MEMBER",
  "UPDATE_MARKET_MEMBER_ROLE",
  "SOFT_DELETE_VENDOR",
  "RESTORE_VENDOR",
  "UPDATE_VENDOR_VERIFICATION",
  "UPDATE_SUBMISSION",
  "DELETE_PROMOTION",
  "UNDO_DECISION",
];

const SETTINGS_ACTIONS = [
  "UPDATE_MAINTENANCE_MODE",
  "UPDATE_ADMIN_PERMISSION_MATRIX",
  "CREATE_API_TOKEN",
  "REVOKE_API_TOKEN",
  "UPDATE_USER_ROLE",
  "UPDATE_USER",
  "DELETE_USER",
];

function statusChangedTo(eventStatus: string, reviewStatus: string): Prisma.AuditLogWhereInput {
  return {
    OR: [
      { action: "UPDATE_EVENT", metadata: { path: ["newValue", "status"], equals: eventStatus } },
      { action: { in: STATUS_ACTIONS }, metadata: { path: ["newValue", "status"], equals: reviewStatus } },
      { action: { in: STATUS_ACTIONS }, metadata: { path: ["status"], equals: reviewStatus } },
    ],
  };
}

const WHAT_WHERE: Record<Exclude<HistoryWhat, "anything">, Prisma.AuditLogWhereInput> = {
  publishing: statusChangedTo("PUBLISHED", "APPROVED"),
  rejecting: statusChangedTo("REJECTED", "REJECTED"),
  editing: { action: { in: EDIT_ACTIONS } },
  merging: { action: "MERGE_VENUES" },
  settings: { action: { in: SETTINGS_ACTIONS } },
};

/** The audit rows the filters let through. `viewerId` answers "You". */
export function historyWhere(filters: HistoryFilters, viewerId: string, now: Date): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  const since = historySince(filters.when, now);
  if (since) and.push({ createdAt: { gte: since } });
  if (filters.what !== "anything") and.push(WHAT_WHERE[filters.what]);
  if (filters.who === "you") and.push({ userId: viewerId });
  else if (filters.who === "tokens") and.push({ metadata: { path: ["via"], equals: "mcp" } });
  else if (filters.who !== "anyone") and.push({ userId: filters.who });
  if (filters.q) {
    const q = filters.q;
    const insensitive = { contains: q, mode: "insensitive" as const };
    and.push({
      OR: [
        { metadata: { path: ["details", "title"], string_contains: q, mode: "insensitive" } },
        { metadata: { path: ["title"], string_contains: q, mode: "insensitive" } },
        { metadata: { path: ["name"], string_contains: q, mode: "insensitive" } },
        { metadata: { path: ["tokenName"], string_contains: q, mode: "insensitive" } },
        { user: { name: insensitive } },
        { user: { email: insensitive } },
        { targetId: q },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

/** Rows strictly older than the cursor in (createdAt, id) order. */
export function olderThan(cursor: HistoryCursor): Prisma.AuditLogWhereInput {
  const at = new Date(cursor.at);
  return { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: cursor.id } }] };
}

/** The cursor below every one of `rows`, or null when there are none. */
export function oldestCursor(rows: readonly HistoryAuditRow[]): HistoryCursor | null {
  let last: HistoryAuditRow | null = null;
  for (const row of rows) {
    if (!last || row.createdAt < last.createdAt || (row.createdAt.getTime() === last.createdAt.getTime() && row.id < last.id)) {
      last = row;
    }
  }
  return last ? { at: last.createdAt.toISOString(), id: last.id } : null;
}

export function isHistoryCursor(value: unknown): value is HistoryCursor {
  if (!value || typeof value !== "object") return false;
  const { at, id } = value as Record<string, unknown>;
  return typeof at === "string" && !Number.isNaN(Date.parse(at)) && typeof id === "string" && id.length > 0 && id.length <= 64;
}
