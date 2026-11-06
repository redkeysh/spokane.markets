import { formatDay, pacificTime } from "@/lib/admin/format";
import type { TodoEvent } from "./types";

/** A day's hours as the pane holds them before saving: 24-hour "HH:MM". */
export type HeldDay = { date: string; allDay: boolean; startTime: string; endTime: string };

/** Edits held in a decision pane until P, X or Ctrl+S saves them with the decision. */
export type HeldEdits = {
  title?: string;
  venueId?: string;
  tagIds?: string[];
  featureIds?: string[];
  scheduleDays?: HeldDay[];
  imageUrl?: string;
  description?: string;
  /** Vendor settings found in the description; each one that differs from the event counts as a change. */
  details?: { vendorApplicationState?: "OPEN" | "CLOSED"; feeModelVendor?: string };
};

/** What the server action accepts: only the fields that changed. */
export type EventEditsInput = {
  title?: string;
  venueId?: string;
  tagIds?: string[];
  featureIds?: string[];
  scheduleDays?: { date: string; allDay: boolean; startTime?: string; endTime?: string }[];
  imageUrl?: string | null;
  description?: string | null;
  details?: { vendorApplicationState?: "OPEN" | "CLOSED"; feeModelVendor?: string };
};

/** The parts of an event the held edits are compared with. */
export type EditableEvent = Pick<TodoEvent, "title" | "venue" | "tags" | "features" | "scheduleDays" | "imageUrl"> &
  Partial<Pick<TodoEvent, "description" | "vendorApplicationState" | "feeModelVendor">>;

const ALL_DAY_START = "00:00";
const ALL_DAY_END = "23:59";

export function daysOf(event: Pick<TodoEvent, "scheduleDays">): HeldDay[] {
  return event.scheduleDays.map((d) => ({ date: d.date, allDay: d.allDay, startTime: d.startTime, endTime: d.endTime }));
}

/**
 * Daily hours proposed for an event stored as one stretch: the same hours every day when it
 * opens before it closes ("Sat 10:00 am to Sun 4:00 pm" becomes 10:00 am to 4:00 pm on both
 * days); otherwise the first day from its start, the last day to its end, and daytime hours
 * between. Only a proposal: the owner checks it before saving.
 */
export function splitIntoDailyHours(event: Pick<TodoEvent, "startIso" | "endIso" | "dates">): HeldDay[] {
  const start = pacificTime(new Date(event.startIso));
  const end = pacificTime(new Date(event.endIso));
  const dates = event.dates;
  if (start === ALL_DAY_START && (end === ALL_DAY_END || end === ALL_DAY_START)) {
    return dates.map((date) => ({ date, allDay: true, startTime: ALL_DAY_START, endTime: ALL_DAY_END }));
  }
  if (start < end) return dates.map((date) => ({ date, allDay: false, startTime: start, endTime: end }));
  return dates.map((date, i) => {
    if (i === 0) return { date, allDay: false, startTime: start, endTime: start < "21:00" ? "21:00" : "23:30" };
    if (i === dates.length - 1) return { date, allDay: false, startTime: end > "10:00" ? "10:00" : "00:30", endTime: end };
    return { date, allDay: false, startTime: "10:00", endTime: "18:00" };
  });
}

/** Why a day's hours cannot be saved, or null. */
export function hardProblem(day: HeldDay): string | null {
  if (day.allDay) return null;
  if (!/^\d{2}:\d{2}$/.test(day.startTime) || !/^\d{2}:\d{2}$/.test(day.endTime)) return "Needs an opening and a closing time.";
  if (day.endTime <= day.startTime) return "Closes before it opens.";
  return null;
}

/** Why a day's hours would mislead visitors, or null. Opening at 12:00 am is shown but can be saved. */
export function dayProblem(day: HeldDay): string | null {
  const hard = hardProblem(day);
  if (hard) return hard;
  if (!day.allDay && day.startTime === "00:00") return "Opens at 12:00 am.";
  return null;
}

function sameDays(a: HeldDay[], b: HeldDay[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((d, i) => {
    const o = b[i];
    if (d.date !== o.date || d.allDay !== o.allDay) return false;
    return d.allDay || (d.startTime === o.startTime && d.endTime === o.endTime);
  });
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return set.size === new Set(b).size && b.every((id) => set.has(id));
}

/** The held edits that differ from the event, field by field; unchanged fields are left out. */
function changedFields(event: EditableEvent, edits: HeldEdits): EventEditsInput {
  const changed: EventEditsInput = {};
  if (edits.title !== undefined && edits.title.trim() !== event.title.trim()) changed.title = edits.title.trim();
  if (edits.venueId && edits.venueId !== event.venue.id) changed.venueId = edits.venueId;
  if (edits.tagIds && !sameIds(edits.tagIds, event.tags.map((t) => t.id))) changed.tagIds = edits.tagIds;
  if (edits.featureIds && !sameIds(edits.featureIds, event.features.map((f) => f.id))) changed.featureIds = edits.featureIds;
  if (edits.scheduleDays && !sameDays(edits.scheduleDays, daysOf(event))) {
    changed.scheduleDays = edits.scheduleDays.map((d) =>
      d.allDay ? { date: d.date, allDay: true } : { date: d.date, allDay: false, startTime: d.startTime, endTime: d.endTime }
    );
  }
  if (edits.imageUrl !== undefined && edits.imageUrl.trim() !== (event.imageUrl ?? "").trim()) {
    changed.imageUrl = edits.imageUrl.trim() || null;
  }
  if (edits.description !== undefined && edits.description.trim() !== (event.description ?? "").trim()) {
    changed.description = edits.description.trim() || null;
  }
  const details: NonNullable<EventEditsInput["details"]> = {};
  const state = edits.details?.vendorApplicationState;
  if (state && state !== (event.vendorApplicationState ?? null)) details.vendorApplicationState = state;
  const fee = edits.details?.feeModelVendor?.trim();
  if (fee && fee !== (event.feeModelVendor ?? "").trim()) details.feeModelVendor = fee;
  if (Object.keys(details).length > 0) changed.details = details;
  return changed;
}

/** How many fields the held edits change ("2 unsaved changes"); each vendor setting counts as one. */
export function changeCount(event: EditableEvent, edits: HeldEdits): number {
  const { details, ...rest } = changedFields(event, edits);
  return Object.keys(rest).length + Object.keys(details ?? {}).length;
}

/** The changed fields for the server, or null when nothing changed. */
export function editsPayload(event: EditableEvent, edits: HeldEdits): EventEditsInput | null {
  const payload = changedFields(event, edits);
  return Object.keys(payload).length ? payload : null;
}

/** Why the held title cannot be saved, or null. */
export function titleProblem(title: string | undefined): string | null {
  return title !== undefined && !title.trim() ? "The title cannot be empty." : null;
}

/** The first problem that keeps the held days from being saved, as a sentence that names the day. */
export function heldDaysProblem(days: HeldDay[], now: Date): string | null {
  for (const day of days) {
    const problem = hardProblem(day);
    if (problem) return `${formatDay(day.date, now)}: ${problem}`;
  }
  return null;
}
