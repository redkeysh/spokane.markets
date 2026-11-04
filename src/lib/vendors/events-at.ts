import type { EventStatus, RosterStatus, VendorIntentStatus } from "@prisma/client";
import { formatDay, formatWeekendSpan, pacificDate, saturdayOf } from "@/lib/admin/format";

export type VendorLinkEvent = {
  id: string;
  title: string;
  slug: string;
  status: EventStatus;
  startDate: Date;
  endDate: Date;
  deletedAt: Date | null;
};

export type VendorLinkSources = {
  /** VendorEvent: the vendor put the event on their profile. */
  listed: ReadonlyArray<{ event: VendorLinkEvent }>;
  /** EventVendorIntent: what the vendor said about going. */
  intents: ReadonlyArray<{ status: VendorIntentStatus; event: VendorLinkEvent }>;
  /** EventVendorRoster: the organizer's official list. */
  roster: ReadonlyArray<{ status: RosterStatus; event: VendorLinkEvent }>;
};

const INTENT_WORDS: Record<VendorIntentStatus, string> = {
  INTERESTED: "Interested",
  APPLIED: "Applied",
  REQUESTED: "Asked to join",
  APPROVED: "Approved by the organizer",
  ATTENDING: "Going",
  WAITLISTED: "On the waitlist",
  DECLINED: "Turned down",
  WITHDREW: "Withdrew",
};

const ROSTER_WORDS: Record<RosterStatus, string> = {
  INVITED: "Invited by the organizer",
  ACCEPTED: "Accepted the organizer's invitation",
  CONFIRMED: "On the organizer's official list",
  CANCELLED: "Taken off the organizer's list",
};

export const LISTED_WORDS = "On their profile";

export type VendorEventRow = {
  id: string;
  title: string;
  slug: string;
  status: EventStatus;
  archived: boolean;
  /** "2026-11-07", the Pacific start date. */
  startIso: string;
  /** "Sat Nov 7" or "Fri Nov 6 to Sun Nov 8". */
  when: string;
  /** Each link between the vendor and the event, in words, the organizer's list first. */
  links: string[];
};

export type VendorEventWeek = {
  /** The Saturday of the week, "2026-11-07". */
  saturday: string;
  /** "Weekend of Nov 6 to 8". */
  heading: string;
  events: VendorEventRow[];
};

export type VendorEventsAt = {
  upcoming: VendorEventWeek[];
  /** Newest first. */
  past: VendorEventRow[];
};

/**
 * Every event a vendor is linked to, from their profile, their own plans and the organizer's
 * official list, one row per event. Upcoming events (ending today or later) are grouped by the
 * Monday-to-Sunday week of their first day, or of today when they are already under way, named
 * by its Saturday.
 */
export function vendorEventsAt(sources: VendorLinkSources, now: Date = new Date()): VendorEventsAt {
  const byId = new Map<string, { event: VendorLinkEvent; roster: string[]; intent: string[]; listed: boolean }>();
  const entry = (event: VendorLinkEvent) => {
    let found = byId.get(event.id);
    if (!found) {
      found = { event, roster: [], intent: [], listed: false };
      byId.set(event.id, found);
    }
    return found;
  };
  for (const r of sources.roster) entry(r.event).roster.push(ROSTER_WORDS[r.status]);
  for (const i of sources.intents) entry(i.event).intent.push(INTENT_WORDS[i.status]);
  for (const l of sources.listed) entry(l.event).listed = true;

  const today = pacificDate(now);
  const rows: { row: VendorEventRow; endIso: string }[] = [];
  for (const { event, roster, intent, listed } of byId.values()) {
    const startIso = pacificDate(event.startDate);
    const endIso = pacificDate(event.endDate);
    rows.push({
      endIso,
      row: {
        id: event.id,
        title: event.title,
        slug: event.slug,
        status: event.status,
        archived: event.deletedAt !== null,
        startIso,
        when: startIso === endIso ? formatDay(startIso, now) : `${formatDay(startIso, now)} to ${formatDay(endIso, now)}`,
        links: [...roster, ...intent, ...(listed ? [LISTED_WORDS] : [])],
      },
    });
  }

  const byStart = (a: VendorEventRow, b: VendorEventRow) =>
    a.startIso === b.startIso ? a.title.localeCompare(b.title) : a.startIso < b.startIso ? -1 : 1;

  const upcomingRows = rows.filter((r) => r.endIso >= today).map((r) => r.row).sort(byStart);
  const past = rows
    .filter((r) => r.endIso < today)
    .map((r) => r.row)
    .sort((a, b) => -byStart(a, b));

  const weeks = new Map<string, VendorEventWeek>();
  for (const row of upcomingRows) {
    const saturday = saturdayOf(row.startIso < today ? today : row.startIso);
    let week = weeks.get(saturday);
    if (!week) {
      week = { saturday, heading: `Weekend of ${formatWeekendSpan(saturday, now)}`, events: [] };
      weeks.set(saturday, week);
    }
    week.events.push(row);
  }
  return { upcoming: [...weeks.values()], past };
}
