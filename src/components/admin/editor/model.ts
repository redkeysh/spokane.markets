/**
 * The event editor's form model: the values it holds, how they start from a
 * record, which of them changed, and the plain helpers the sections share.
 * Pure: no database, no React.
 */
import {
  addDays,
  dateColumnToIso,
  formatShortDate,
  formatMonthDay,
  pacificDate,
  pacificTime,
  saturdayOf,
  weekdayIndex,
} from "@/lib/admin/format";
import { slugify } from "@/lib/utils";
import { EVENT_SLUG_MAX_LENGTH } from "@/lib/events/slug-rules";
import type { EventStatusValue } from "@/components/admin/kit/status-menu";

export type { EventStatusValue };

export type EditorMode = "event" | "new" | "submission";

export type EditorDay = { key: string; date: string; startTime: string; endTime: string; allDay: boolean };

export type PlaceFields = { name: string; address: string; city: string; state: string; zip: string };

export const EMPTY_PLACE: PlaceFields = { name: "", address: "", city: "", state: "", zip: "" };

/** An event that runs from one instant to another with no daily hours. Pacific dates and times. */
export type Stretch = { startDate: string; startTime: string; endDate: string; endTime: string };

export type DetailKind = "enum" | "text" | "long" | "int" | "yesno" | "date";

export type DetailField = {
  key: string;
  label: string;
  kind: DetailKind;
  group: "Visiting" | "Vendors" | "Permits and safety";
  options?: ReadonlyArray<{ value: string; label: string }>;
};

/** The onboarding fields the editor shows under More details, in reading order. */
export const DETAIL_FIELDS = [
  {
    key: "indoorOutdoor",
    label: "Indoor or outdoor",
    kind: "enum",
    group: "Visiting",
    options: [
      { value: "INDOOR", label: "Indoor" },
      { value: "OUTDOOR", label: "Outdoor" },
      { value: "HYBRID", label: "Indoor and outdoor" },
    ],
  },
  { key: "accessibilitySummary", label: "Accessibility", kind: "long", group: "Visiting" },
  { key: "parkingSummary", label: "Parking", kind: "long", group: "Visiting" },
  {
    key: "restroomAccess",
    label: "Restrooms",
    kind: "enum",
    group: "Visiting",
    options: [
      { value: "YES", label: "On site" },
      { value: "NEARBY", label: "Nearby" },
      { value: "NO", label: "None" },
      { value: "UNKNOWN", label: "Not known" },
    ],
  },
  {
    key: "petPolicy",
    label: "Pets",
    kind: "enum",
    group: "Visiting",
    options: [
      { value: "ALLOWED", label: "Welcome" },
      { value: "RESTRICTED", label: "Allowed with rules" },
      { value: "PROHIBITED", label: "Not allowed" },
      { value: "UNKNOWN", label: "Not known" },
    ],
  },
  {
    key: "vendorApplicationState",
    label: "Vendor applications",
    kind: "enum",
    group: "Vendors",
    options: [
      { value: "OPEN", label: "Open" },
      { value: "WAITLIST", label: "Waitlist" },
      { value: "CLOSED", label: "Closed" },
      { value: "NOT_ACCEPTING", label: "Not taking applications" },
    ],
  },
  { key: "vendorApplicationDeadline", label: "Application deadline", kind: "date", group: "Vendors" },
  { key: "feeModelVendor", label: "Booth fees", kind: "long", group: "Vendors" },
  { key: "boothLogistics", label: "Booth setup and load-in", kind: "long", group: "Vendors" },
  { key: "typicalVendorCount", label: "Usual number of vendors", kind: "text", group: "Vendors" },
  {
    key: "specialEventPermitStatus",
    label: "Special event permit",
    kind: "enum",
    group: "Permits and safety",
    options: [
      { value: "APPROVED", label: "Approved" },
      { value: "PENDING", label: "Applied for" },
      { value: "NOT_REQUIRED", label: "Not required" },
      { value: "NOT_APPLICABLE", label: "Does not apply" },
      { value: "UNKNOWN", label: "Not known" },
    ],
  },
  { key: "expectedAttendance", label: "Expected visitors", kind: "int", group: "Permits and safety" },
  { key: "streetClosureImpact", label: "Closes a street", kind: "yesno", group: "Permits and safety" },
  { key: "streetClosureNarrative", label: "Street closure details", kind: "long", group: "Permits and safety" },
  { key: "insuranceSummary", label: "Insurance", kind: "long", group: "Permits and safety" },
  { key: "safetyPlanSummary", label: "Safety plan", kind: "long", group: "Permits and safety" },
  { key: "sanitationPlan", label: "Sanitation", kind: "long", group: "Permits and safety" },
  { key: "cancellationPolicy", label: "Cancellation policy", kind: "long", group: "Permits and safety" },
] as const satisfies readonly DetailField[];

export type DetailKey = (typeof DETAIL_FIELDS)[number]["key"];

export const DETAIL_KEYS: readonly DetailKey[] = DETAIL_FIELDS.map((f) => f.key);

/** Every onboarding column on an event; "0 of 33 filled" counts these. */
export const ONBOARDING_COLUMNS = [
  "listingKind",
  "organizerDisplayName",
  "organizerPublicContact",
  "eventType",
  "occurrenceModel",
  "timezone",
  "indoorOutdoor",
  "shortDescription",
  "vendorCategoryPolicy",
  "vendorApplicationState",
  "vendorApplicationDeadline",
  "vendorWorkflowMode",
  "termsAttested",
  "specialEventPermitStatus",
  "expectedAttendance",
  "streetClosureImpact",
  "streetClosureNarrative",
  "insuranceSummary",
  "safetyPlanSummary",
  "sanitationPlan",
  "cancellationPolicy",
  "accessibilitySummary",
  "parkingSummary",
  "restroomAccess",
  "petPolicy",
  "paymentMethodsPublic",
  "productHighlights",
  "typicalVendorCount",
  "feeModelVendor",
  "boothLogistics",
  "communicationChannels",
  "equityInclusionNotes",
  "verificationChecklist",
] as const;

export type DetailValues = Record<DetailKey, string>;

export const PARTICIPATION_OPTIONS = [
  { value: "", label: "Use the market's setting" },
  { value: "OPEN", label: "Mark as attending" },
  { value: "REQUEST_TO_JOIN", label: "Request to join" },
  { value: "INVITE_ONLY", label: "Invite only or juried" },
  { value: "CAPACITY_LIMITED", label: "Request to join, limited spots" },
] as const;

export type EditorValues = {
  title: string;
  slug: string;
  description: string;
  /** Empty while a multi-day event still runs as one stretch (see Stretch). */
  days: EditorDay[];
  venueId: string;
  /** A place typed in by hand: a new place for events, the place itself for submissions. */
  place: PlaceFields;
  marketId: string;
  imageUrl: string;
  showImageInList: boolean;
  imageFocalX: number;
  imageFocalY: number;
  tagIds: string[];
  featureIds: string[];
  websiteUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  participationMode: string;
  vendorCapacity: string;
  publicIntentListEnabled: boolean | null;
  publicIntentNamesEnabled: boolean | null;
  publicRosterEnabled: boolean | null;
  details: DetailValues;
  complianceNotes: string;
  status: EventStatusValue;
};

export type EditorField = Exclude<keyof EditorValues, "details"> | `details.${DetailKey}`;

/** A field an error can sit under: an editor field, or one part of a place typed in by hand. */
export type EditorErrorField = EditorField | `place.${keyof PlaceFields}`;

export type EditorErrors = Partial<Record<EditorErrorField, string>>;

const FIELD_SECTIONS: Record<string, string> = {
  title: "listing",
  slug: "listing",
  description: "listing",
  days: "when",
  venueId: "where",
  place: "where",
  marketId: "where",
  imageUrl: "picture",
  showImageInList: "picture",
  imageFocalX: "picture",
  imageFocalY: "picture",
  tagIds: "tags-and-features",
  featureIds: "tags-and-features",
  websiteUrl: "links",
  facebookUrl: "links",
  instagramUrl: "links",
  participationMode: "vendors",
  vendorCapacity: "vendors",
  publicIntentListEnabled: "vendors",
  publicIntentNamesEnabled: "vendors",
  publicRosterEnabled: "vendors",
  details: "more-details",
  complianceNotes: "notes",
};

/** The id of the section that holds a field. */
export function sectionOf(field: EditorErrorField): string | null {
  return FIELD_SECTIONS[field.split(".")[0]] ?? null;
}

/** The errors left once the `touched` fields change: an error on a field or on any part of it goes. */
export function clearErrors(errors: EditorErrors, touched: readonly string[]): EditorErrors {
  const stale = (Object.keys(errors) as EditorErrorField[]).filter((key) => touched.some((t) => key === t || key.startsWith(`${t}.`)));
  if (stale.length === 0) return errors;
  const next = { ...errors };
  for (const key of stale) delete next[key];
  return next;
}

/** The fields each mode edits. A submission has no web address, focal point, vendor settings, details or notes. */
export const MODE_FIELDS: Record<EditorMode, readonly (keyof EditorValues)[]> = {
  event: [
    "title",
    "slug",
    "description",
    "days",
    "venueId",
    "place",
    "marketId",
    "imageUrl",
    "showImageInList",
    "imageFocalX",
    "imageFocalY",
    "tagIds",
    "featureIds",
    "websiteUrl",
    "facebookUrl",
    "instagramUrl",
    "participationMode",
    "vendorCapacity",
    "publicIntentListEnabled",
    "publicIntentNamesEnabled",
    "publicRosterEnabled",
    "details",
    "complianceNotes",
    "status",
  ],
  new: [
    "title",
    "slug",
    "description",
    "days",
    "venueId",
    "place",
    "marketId",
    "imageUrl",
    "showImageInList",
    "imageFocalX",
    "imageFocalY",
    "tagIds",
    "featureIds",
    "websiteUrl",
    "facebookUrl",
    "instagramUrl",
    "participationMode",
    "vendorCapacity",
    "publicIntentListEnabled",
    "publicIntentNamesEnabled",
    "publicRosterEnabled",
    "details",
    "complianceNotes",
    "status",
  ],
  submission: [
    "title",
    "description",
    "days",
    "place",
    "marketId",
    "imageUrl",
    "tagIds",
    "featureIds",
    "websiteUrl",
    "facebookUrl",
    "instagramUrl",
  ],
};

export function emptyDetails(): DetailValues {
  return Object.fromEntries(DETAIL_KEYS.map((key) => [key, ""])) as DetailValues;
}

let dayCounter = 0;

/** A fresh React key for a schedule row; server and browser keys never collide. */
export function dayKey(): string {
  dayCounter += 1;
  return `${typeof window === "undefined" ? "s" : "c"}${dayCounter}`;
}

export function makeDay(date: string, startTime: string, endTime: string, allDay = false): EditorDay {
  return { key: dayKey(), date, startTime: allDay ? "" : startTime, endTime: allDay ? "" : endTime, allDay };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sameDays(a: readonly EditorDay[], b: readonly EditorDay[]): boolean {
  return (
    a.length === b.length &&
    a.every((d, i) => {
      const o = b[i];
      return d.date === o.date && d.allDay === o.allDay && (d.allDay || (d.startTime === o.startTime && d.endTime === o.endTime));
    })
  );
}

function samePlace(a: PlaceFields, b: PlaceFields): boolean {
  return a.name === b.name && a.address === b.address && a.city === b.city && a.state === b.state && a.zip === b.zip;
}

/** The fields whose value differs from the starting values, in form order; each detail counts on its own. */
export function changedFields(initial: EditorValues, current: EditorValues, mode: EditorMode): EditorField[] {
  const changed: EditorField[] = [];
  for (const key of MODE_FIELDS[mode]) {
    if (key === "details") {
      for (const detail of DETAIL_KEYS) {
        if (initial.details[detail] !== current.details[detail]) changed.push(`details.${detail}`);
      }
      continue;
    }
    const a = initial[key];
    const b = current[key];
    let same: boolean;
    if (key === "days") same = sameDays(a as EditorDay[], b as EditorDay[]);
    else if (key === "place") same = samePlace(a as PlaceFields, b as PlaceFields);
    else if (key === "tagIds" || key === "featureIds") same = sameList([...(a as string[])].sort(), [...(b as string[])].sort());
    else same = a === b;
    if (!same) changed.push(key);
  }
  return changed;
}

/** "1 unsaved change", "2 unsaved changes". */
export function unsavedLabel(count: number): string {
  return `${count} unsaved ${count === 1 ? "change" : "changes"}`;
}

/** The changed values only, so a save never writes over a field it did not touch. */
export function pickChanges(current: EditorValues, fields: readonly EditorField[]): Partial<Omit<EditorValues, "details">> & {
  details?: Partial<DetailValues>;
} {
  const out: Record<string, unknown> = {};
  const details: Partial<DetailValues> = {};
  for (const field of fields) {
    if (field.startsWith("details.")) {
      const key = field.slice("details.".length) as DetailKey;
      details[key] = current.details[key];
    } else {
      out[field] = current[field as keyof EditorValues];
    }
  }
  if (Object.keys(details).length > 0) out.details = details;
  return out as Partial<Omit<EditorValues, "details">> & { details?: Partial<DetailValues> };
}

/** The web address made from a title and its first date: "north-idahos-cowboy-christmas-2026-12-12". */
export function autoSlug(title: string, firstDate: string | null | undefined): string {
  const date = firstDate && /^\d{4}-\d{2}-\d{2}$/.test(firstDate) ? firstDate : "";
  const base = slugify(title).replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "") || "event";
  const room = EVENT_SLUG_MAX_LENGTH - (date ? date.length + 1 : 0);
  const trimmed = base.slice(0, room).replace(/-+$/, "");
  return date ? `${trimmed}-${date}` : trimmed;
}

const PLATFORM_HOSTS: Record<"facebook" | "instagram", string> = {
  facebook: "facebook.com",
  instagram: "instagram.com",
};

/**
 * A link as the owner typed it, made into an https:// address: bare domains get https://, and a
 * handle ("@rebeljunk") becomes the platform's address. Empty stays empty.
 */
export function normalizeLink(value: string, kind: "website" | "facebook" | "instagram"): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (kind !== "website") {
    const host = PLATFORM_HOSTS[kind];
    const handle = trimmed.replace(/^@/, "");
    const looksLikeHandle = !handle.includes(".") && !handle.includes("/") && !/\s/.test(handle);
    if (looksLikeHandle) return `https://${host}/${handle}`;
  }
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^http:\/\//i.test(trimmed)) return `https://${trimmed.slice(7)}`;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

/** True when a normalized link parses as a web address with a dotted host. */
export function isWebAddress(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Title Case for a place typed in capitals: "7217 W WESTBOW BLVD" becomes "7217 W Westbow Blvd". */
export function fixCapitals(text: string): string {
  const keepUpper = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "WA", "ID", "US", "PO"]);
  return text
    .toLowerCase()
    .replace(/[a-z0-9'’]+/g, (word) => {
      const upper = word.toUpperCase();
      if (keepUpper.has(upper)) return upper;
      if (/^\d+(st|nd|rd|th)$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
}

/** True when a field was typed in capitals (at least four letters, none lowercase). */
export function isShouting(text: string): boolean {
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length >= 4 && letters === letters.toUpperCase();
}

/** How many of the 33 onboarding columns hold a value. */
export function filledDetailCount(row: Record<string, unknown>): number {
  return ONBOARDING_COLUMNS.filter((key) => {
    const value = row[key];
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim() !== "";
    if (typeof value === "boolean") return key === "organizerPublicContact" || key === "termsAttested" ? value : true;
    if (typeof value === "object" && !(value instanceof Date)) return Object.keys(value as object).length > 0;
    return true;
  }).length;
}

/** The detail values of an event row, as the form holds them (strings; "yes" or "no" for yes-or-no). */
export function detailsFromRow(row: Record<string, unknown>): DetailValues {
  const out = emptyDetails();
  for (const field of DETAIL_FIELDS as readonly DetailField[]) {
    const value = row[field.key];
    const key = field.key as DetailKey;
    if (value === null || value === undefined) continue;
    switch (field.kind) {
      case "yesno":
        out[key] = value === true ? "yes" : value === false ? "no" : "";
        break;
      case "date":
        out[key] = value instanceof Date ? pacificDate(value) : typeof value === "string" ? value.slice(0, 10) : "";
        break;
      case "int":
        out[key] = typeof value === "number" ? String(value) : "";
        break;
      default:
        out[key] = typeof value === "string" ? value : "";
    }
  }
  return out;
}

/** Schedule rows from an event: its schedule days, or one row for a single-day event. */
export function daysFromEvent(event: {
  startDate: Date;
  endDate: Date;
  scheduleDays: { date: Date | string; startTime: string; endTime: string; allDay: boolean }[];
}): { days: EditorDay[]; stretch: Stretch | null } {
  if (event.scheduleDays.length > 0) {
    const days = [...event.scheduleDays]
      .map((d) => {
        const date = typeof d.date === "string" ? d.date.slice(0, 10) : dateColumnToIso(d.date);
        const allDay = d.allDay || (d.startTime === "00:00" && d.endTime === "23:59");
        return makeDay(date, d.startTime, d.endTime, allDay);
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    return { days, stretch: null };
  }
  const startDate = pacificDate(event.startDate);
  const startTime = pacificTime(event.startDate);
  const endTime = pacificTime(event.endDate);
  let endDate = pacificDate(event.endDate);
  if (endTime === "00:00" && endDate > startDate) endDate = addDays(endDate, -1);
  if (endDate === startDate) {
    const allDay = startTime === "00:00" && (endTime === "23:59" || endTime === "00:00");
    return { days: [makeDay(startDate, startTime, endTime, allDay)], stretch: null };
  }
  return { days: [], stretch: { startDate, startTime, endDate, endTime: endTime === "00:00" ? "23:59" : endTime } };
}

type SubmissionDayJson = { date?: unknown; startTime?: unknown; endTime?: unknown; allDay?: unknown };

/** Schedule rows from a submission: its schedule days, or its legacy date fields. */
export function daysFromSubmission(s: {
  scheduleDays: unknown;
  eventDate: string;
  eventTime: string;
  endDate: string | null;
  endTime: string | null;
  allDay: boolean;
}): EditorDay[] {
  if (Array.isArray(s.scheduleDays) && s.scheduleDays.length > 0) {
    return (s.scheduleDays as SubmissionDayJson[])
      .filter((d) => typeof d?.date === "string")
      .map((d) => {
        const start = typeof d.startTime === "string" ? d.startTime : "";
        const end = typeof d.endTime === "string" ? d.endTime : "";
        const allDay = d.allDay === true || (start === "00:00" && end === "23:59");
        return makeDay(String(d.date).slice(0, 10), start, end, allDay);
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  const last = s.endDate && s.endDate > s.eventDate ? s.endDate : s.eventDate;
  const days: EditorDay[] = [];
  for (let date = s.eventDate; date <= last && days.length < 31; date = addDays(date, 1)) {
    days.push(makeDay(date, s.eventTime, s.endTime ?? "", s.allDay));
  }
  return days;
}

/** The Saturday a schedule falls on: of its first date on or after today, else of its first date. */
export function weekendOf(days: readonly { date: string }[], stretch: Stretch | null, today: string): string | null {
  const dates = days.length > 0 ? days.map((d) => d.date).filter(Boolean).sort() : stretch ? [stretch.startDate] : [];
  if (dates.length === 0) return null;
  const upcoming = dates.find((d) => d >= today) ?? dates[0];
  return saturdayOf(upcoming);
}

/** "Falls on the weekend of Dec 12." */
export function weekendSentence(saturday: string, now: Date = new Date()): string {
  return `Falls on the weekend of ${formatMonthDay(saturday, now)}.`;
}

/** The rail column key for a Saturday: the Saturday itself when the rail shows it, "later" after it. */
export function railWeekKey(saturday: string | null, railKeys: readonly string[]): string | null {
  if (!saturday) return null;
  if (railKeys.includes(saturday)) return saturday;
  const dated = railKeys.filter((k) => k !== "later").sort();
  const last = dated[dated.length - 1];
  return last && saturday > last && railKeys.includes("later") ? "later" : null;
}

/** The next Saturday on or after a date, for a new event's first day. */
export function comingSaturday(today: string): string {
  return addDays(today, (5 - weekdayIndex(today) + 7) % 7);
}

/** "Nov 7" or "Nov 7, 2027" for a short label. */
export function shortDay(date: string, now: Date = new Date()): string {
  return date.slice(0, 4) === pacificDate(now).slice(0, 4) ? formatShortDate(date) : formatMonthDay(date, now);
}

export { REJECT_REASONS } from "@/lib/admin/reject-reasons";

/** Record pages the editor can be opened from, by the first segment after /admin. */
const RECORD_PAGE_LABEL: Record<string, string> = {
  markets: "Back to the market",
  venues: "Back to the place",
  vendors: "Back to the vendor",
};

/** Where Esc, Cancel and the back link go, named for where the owner came from. */
export function backTarget(params: {
  from?: string | null;
  back?: string | null;
  decision?: string | null;
  rest?: Record<string, string>;
  mode: EditorMode;
}): { href: string; label: string } {
  const back = params.back && params.back.startsWith("/admin") && !params.back.startsWith("//") ? params.back : null;
  const record = back?.match(/^\/admin\/(markets|venues|vendors)\/(?!new(?:[/?#]|$))[^/?#]+(?:[?#].*)?$/)?.[1];
  if (back && record) return { href: back, label: RECORD_PAGE_LABEL[record] };
  switch (params.from) {
    case "todo":
      return { href: back ?? (params.decision ? `/admin?d=${encodeURIComponent(params.decision)}` : "/admin"), label: "Back to To do" };
    case "events": {
      if (back) return { href: back, label: "Back to Events" };
      const query = new URLSearchParams(params.rest ?? {}).toString();
      return { href: query ? `/admin/events?${query}` : "/admin/events", label: "Back to Events" };
    }
    case "inbox":
      return { href: back ?? "/admin/submissions", label: "Back to Sent from the site" };
    case "markets":
      return { href: back ?? "/admin/markets", label: "Back to Markets" };
    case "venues":
      return { href: back ?? "/admin/venues", label: "Back to Venues" };
    case "vendors":
      return { href: back ?? "/admin/vendors", label: "Back to Vendors" };
  }
  if (params.mode === "submission") return { href: back ?? "/admin?lane=public", label: "Back to To do" };
  return { href: back ?? "/admin/events", label: "Back to Events" };
}

/** Query string that carries where the owner came from to the next or previous record. */
export function carryParams(params: { from?: string | null; back?: string | null; decision?: string | null }): string {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.back) q.set("back", params.back);
  if (params.decision) q.set("d", params.decision);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const STATUS_SENTENCE: Record<EventStatusValue, string> = {
  PUBLISHED: "Published: on the site",
  PENDING: "Pending: waiting for your review",
  DRAFT: "Draft: hidden while you prepare it",
  CANCELLED: "Cancelled: not happening, hidden from the site",
  REJECTED: "Rejected: not a fit, hidden from the site",
};

/**
 * The action bar's status sentence: the saved status, or, while another status is held, what
 * saving will do.
 */
export function statusSentence(saved: EventStatusValue, held: EventStatusValue): string {
  if (held === saved) return STATUS_SENTENCE[saved];
  const site = saved === "PUBLISHED" ? "comes off the site" : "stays off the site";
  switch (held) {
    case "PUBLISHED":
      return "When you save: goes on the site";
    case "PENDING":
      return `When you save: moves to pending and ${site}`;
    case "DRAFT":
      return `When you save: moves to draft and ${site}`;
    case "CANCELLED":
      return `When you save: marked cancelled and ${site}`;
    case "REJECTED":
      return `When you save: rejected and ${site}`;
  }
}

export { savedAgo } from "@/lib/admin/format";

/** First name for "Publish and tell Dana". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Dana", "Dana and Lee", "Dana, Lee and Sam". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Weekday name to 0 = Monday through 6 = Sunday. */
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/**
 * Daily hours proposed for an event that runs as one stretch: hours stated in the description when
 * they cover its days, otherwise the first day's opening time to the last day's closing time on
 * every day.
 */
export function proposeDailyHours(
  stretch: Stretch,
  stated: { date: string | null; weekday: string | null; startTime: string; endTime: string }[] = []
): EditorDay[] {
  const days: EditorDay[] = [];
  for (let date = stretch.startDate; date <= stretch.endDate && days.length < 31; date = addDays(date, 1)) {
    const weekday = WEEKDAYS[weekdayIndex(date)];
    const match = stated.find((s) => s.date === date) ?? stated.find((s) => !s.date && s.weekday?.toLowerCase().startsWith(weekday.slice(0, 3)));
    if (match) days.push(makeDay(date, match.startTime, match.endTime));
    else days.push(makeDay(date, stretch.startTime, stretch.endTime));
  }
  return days;
}

/** Problems with one schedule row that the owner should see next to it. */
export function dayProblems(day: EditorDay): { kind: "error" | "check"; message: string }[] {
  if (!day.date) return [{ kind: "error", message: "Choose a date." }];
  if (day.allDay) return [];
  if (!day.startTime || !day.endTime) return [{ kind: "error", message: "Choose when it opens and closes, or tick All day." }];
  const problems: { kind: "error" | "check"; message: string }[] = [];
  if (day.endTime < day.startTime) problems.push({ kind: "error", message: "Closes before it opens." });
  else if (day.endTime === day.startTime) problems.push({ kind: "error", message: "Opens and closes at the same time." });
  if (day.startTime === "00:00") problems.push({ kind: "check", message: "Opens at 12:00 am. Is this a midnight split?" });
  return problems;
}

/** Dates used by more than one row. */
export function repeatedDates(days: readonly EditorDay[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const d of days) {
    if (!d.date) continue;
    if (seen.has(d.date)) repeated.add(d.date);
    seen.add(d.date);
  }
  return repeated;
}

/** Time choices in 15 minute steps from 6:00 am round the clock, plus 11:59 pm for closing. */
export function timeChoices(): string[] {
  const all: string[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
    all.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  const pivot = all.indexOf("06:00");
  return [...all.slice(pivot), ...all.slice(0, pivot), "23:59"];
}

/**
 * The first thing that stops a save, with the section that holds it. With `changed`, only the
 * fields being sent are checked, so a problem already saved in an untouched field never blocks.
 */
export function blockingProblem(
  values: EditorValues,
  ctx: { mode: string; hasStretch: boolean; placeIds: ReadonlySet<string>; changed?: ReadonlySet<string> }
): { text: string; section: string; field: EditorErrorField } | null {
  const checks = (...fields: string[]) => !ctx.changed || fields.some((f) => ctx.changed!.has(f));
  if (checks("title") && !values.title.trim()) return { text: "Give it a title.", section: "listing", field: "title" };
  if (checks("days")) {
    if (values.days.length === 0 && !ctx.hasStretch) return { text: "Add at least one day.", section: "when", field: "days" };
    for (const day of values.days) {
      const error = dayProblems(day).find((p) => p.kind === "error");
      if (error) return { text: `Check the dates under When: ${error.message}`, section: "when", field: "days" };
    }
  }
  if (checks("venueId", "place")) {
    if (ctx.mode !== "submission") {
      if (!values.venueId || !ctx.placeIds.has(values.venueId)) {
        const p = values.place;
        const missing = PLACE_PARTS.find((part) => !p[part].trim());
        if (missing) {
          const field: EditorErrorField = p.name.trim() || p.address.trim() ? `place.${missing}` : "venueId";
          return { text: "Choose a place, or fill in the new place's name, street, city, state and ZIP.", section: "where", field };
        }
      }
    } else if (!values.place.name.trim() || !values.place.address.trim()) {
      return { text: "The place needs a name and a street.", section: "where", field: values.place.name.trim() ? "place.address" : "place.name" };
    }
  }
  for (const [key, kind, label] of [
    ["websiteUrl", "website", "Website"],
    ["facebookUrl", "facebook", "Facebook"],
    ["instagramUrl", "instagram", "Instagram"],
  ] as const) {
    if (checks(key) && values[key].trim() && !isWebAddress(normalizeLink(values[key], kind))) {
      return { text: `${label} must be a web address, such as example.com.`, section: "links", field: key };
    }
  }
  return null;
}

/** The parts of a place, in the order the form shows them. */
export const PLACE_PARTS = ["name", "address", "city", "state", "zip"] as const satisfies readonly (keyof PlaceFields)[];
