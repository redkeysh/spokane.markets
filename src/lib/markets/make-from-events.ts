import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { decisionDetails, type DecisionRef } from "@/lib/admin/decision-details";
import { dateColumnToIso, formatTimeRange, pacificDate, pacificTime, weekdayIndex } from "@/lib/admin/format";
import { eventLocalDates, type ScheduleDayRow } from "@/lib/events/readiness";
import { EventMutationError } from "@/lib/events/mutations";
import { slugify } from "@/lib/utils";

export type MarketSourceEvent = {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  scheduleDays: ScheduleDayRow[];
  venueId: string;
};

export type MarketDraft = { name: string; venueId: string; typicalSchedule: string | null };

const WEEKDAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth"];
const SINGULAR = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function mostCommon<T>(values: T[], tieBreak: (a: T, b: T) => number): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || tieBreak(a[0], b[0]))[0][0];
}

/** "Fridays to Sundays", "Saturdays", "Wednesdays and Saturdays". */
function weekdayWords(indexes: number[]): string {
  const sorted = [...new Set(indexes)].sort((a, b) => a - b);
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (sorted.length >= 3 && consecutive) return `${WEEKDAYS[sorted[0]]} to ${WEEKDAYS[sorted[sorted.length - 1]]}`;
  const words = sorted.map((d) => WEEKDAYS[d]);
  return words.length <= 2 ? words.join(" and ") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The day-and-hours line a market shows ("Fridays to Sundays, 12:00 to 4:00 pm"), from its dates. */
export function typicalScheduleFrom(events: MarketSourceEvent[]): string | null {
  const days = events.flatMap((e) => {
    if (e.scheduleDays.length > 0) return e.scheduleDays;
    return eventLocalDates(e).map((date) => ({
      date,
      startTime: date === pacificDate(e.startDate) ? pacificTime(e.startDate) : "00:00",
      endTime: pacificTime(e.endDate),
      allDay: false,
    }));
  });
  if (days.length === 0) return null;

  const weekdays = days.map((d) => weekdayIndex(d.date));
  const oneDayEach = events.every((e) => eventLocalDates(e).length === 1);
  const nth = days.map((d) => Math.ceil(Number(d.date.slice(8, 10)) / 7));
  const months = new Set(days.map((d) => d.date.slice(0, 7)));
  let when: string;
  if (oneDayEach && days.length >= 2 && new Set(weekdays).size === 1 && new Set(nth).size === 1 && months.size === days.length) {
    when = `${ORDINALS[nth[0] - 1]} ${SINGULAR[weekdays[0]]} of the month`;
  } else {
    when = weekdayWords(weekdays);
  }

  const timed = days.filter((d) => !d.allDay);
  const hours = new Set(timed.map((d) => `${d.startTime}-${d.endTime}`));
  if (timed.length === days.length && hours.size === 1) {
    const [start, end] = [...hours][0].split("-");
    if (start < end) return `${when}, ${formatTimeRange(start, end)}`;
  }
  return when;
}

/**
 * The market a set of dates suggests: the most common title without a year,
 * the most used place, and a typical schedule from the dates. Pure.
 */
export function marketDraftFromEvents(events: MarketSourceEvent[]): MarketDraft {
  if (events.length === 0) throw new Error("A market needs at least one event.");
  const byStart = [...events].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const titles = byStart.map((e) => e.title.replace(/\s+(19|20)\d{2}\s*$/, "").trim());
  const name = mostCommon(titles, (a, b) => a.length - b.length || a.localeCompare(b));
  const venueId = mostCommon(
    byStart.map((e) => e.venueId),
    (a, b) => byStart.findIndex((e) => e.venueId === a) - byStart.findIndex((e) => e.venueId === b)
  );
  return { name, venueId, typicalSchedule: typicalScheduleFrom(byStart) };
}

async function uniqueMarketSlug(name: string): Promise<string> {
  const base = slugify(name) || "market";
  const taken = new Set(
    (await db.market.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((m) => m.slug)
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * Creates a market from events that repeat (see marketDraftFromEvents; any
 * override wins) and links every one of them to it, in one transaction.
 * Writes CREATE_MARKET and one UPDATE_EVENT per linked event.
 */
export async function makeMarketFromEvents(
  eventIds: string[],
  overrides: Partial<MarketDraft> & { description?: string | null },
  actorId: string,
  options: DecisionRef & { auditMeta?: Record<string, unknown> } = {}
): Promise<{ marketId: string; slug: string; linked: string[] }> {
  const rows = await db.event.findMany({
    where: { id: { in: [...new Set(eventIds)] }, deletedAt: null },
    select: {
      id: true,
      title: true,
      slug: true,
      startDate: true,
      endDate: true,
      venueId: true,
      marketId: true,
      scheduleDays: { select: { date: true, startTime: true, endTime: true, allDay: true } },
    },
  });
  if (rows.length === 0) throw new EventMutationError("None of those events exist.");
  const draft = {
    ...marketDraftFromEvents(rows.map((r) => ({ ...r, scheduleDays: r.scheduleDays.map((d) => ({ ...d, date: dateColumnToIso(d.date) })) }))),
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
  } as MarketDraft & { description?: string | null };
  if (!draft.name.trim()) throw new EventMutationError("The market needs a name.");
  const venue = await db.venue.findFirst({ where: { id: draft.venueId, deletedAt: null }, select: { id: true } });
  if (!venue) throw new EventMutationError("The market's place does not exist or is archived.");

  const slug = await uniqueMarketSlug(draft.name);
  const at = new Date();
  const details = { at: at.toISOString(), ...decisionDetails(options) };
  const market = await db.$transaction(async (tx) => {
    const created = await tx.market.create({
      data: {
        name: draft.name.trim(),
        slug,
        venueId: draft.venueId,
        typicalSchedule: draft.typicalSchedule,
        ...(draft.description !== undefined ? { description: draft.description } : {}),
        updatedAt: at,
      },
      select: { id: true, name: true },
    });
    await tx.event.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { marketId: created.id, updatedAt: at } });
    await tx.auditLog.createMany({
      data: [
        {
          userId: actorId,
          action: "CREATE_MARKET",
          targetType: "MARKET",
          targetId: created.id,
          metadata: { newValue: { name: created.name, slug, venueId: draft.venueId, typicalSchedule: draft.typicalSchedule }, details: { ...details, title: created.name }, ...options.auditMeta } as Prisma.InputJsonValue,
        },
        ...rows.map((row) => ({
          userId: actorId,
          action: "UPDATE_EVENT",
          targetType: "EVENT",
          targetId: row.id,
          metadata: { previousValue: { marketId: row.marketId }, newValue: { marketId: created.id }, details: { ...details, title: row.title }, ...options.auditMeta } as Prisma.InputJsonValue,
        })),
      ],
    });
    return created;
  });

  revalidateAdmin({ eventSlugs: rows.map((r) => r.slug), marketSlugs: [slug] });
  return { marketId: market.id, slug, linked: rows.map((r) => r.id) };
}
