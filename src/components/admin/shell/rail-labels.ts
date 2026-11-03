import type { RailStall, RailStatus, RailWeek } from "@/lib/admin/weekends";
import type { StallStatus } from "@/components/admin/kit/stall";

export type CaptionTone = "ash" | "honey" | "cedar";

const STATUS_WORD: Record<RailStatus, string> = { PUBLISHED: "Published", PENDING: "Pending", DRAFT: "Draft" };

function total(week: RailWeek): number {
  return week.live + week.pending + week.draft;
}

/** Full rail caption: "1 of 22 live", honey when nothing is live yet, cedar "All 13 live" when complete. */
export function railCaption(week: RailWeek): { text: string; tone: CaptionTone } {
  const count = total(week);
  if (count === 0) return { text: "Nothing listed", tone: "ash" };
  if (week.live === count) return { text: `All ${count} live`, tone: "cedar" };
  return { text: `${week.live} of ${count} live`, tone: week.live === 0 ? "honey" : "ash" };
}

/** Slim rail caption: "1 of 22", honey when nothing is live yet. */
export function slimCaption(week: RailWeek): { text: string; tone: CaptionTone } {
  const count = total(week);
  if (count === 0) return { text: "Nothing", tone: "ash" };
  return { text: `${week.live} of ${count}`, tone: week.live === 0 ? "honey" : "ash" };
}

/** The slim rail's one stall per week: cedar when all live, honey when anything waits, an outline when empty. */
export function summaryStatus(week: RailWeek): StallStatus {
  const count = total(week);
  if (count === 0) return "EMPTY";
  return week.live === count ? "PUBLISHED" : "PENDING";
}

const LONG_DATE = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const CHIP_DATE = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function utcNoon(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** "Today, Tuesday November 3". */
export function todayLabel(today: string): string {
  return `Today, ${LONG_DATE.format(utcNoon(today)).replace(",", "")}`;
}

/** "Sat Nov 7", or "Later". */
export function chipDate(week: RailWeek): string {
  return week.saturday ? CHIP_DATE.format(utcNoon(week.saturday)).replace(",", "") : week.label;
}

/**
 * The column link's accessible name, starting with the visible date (WCAG 2.5.3), which is
 * `week.label` unless `visibleDate` says otherwise:
 * "Nov 7, weekend of Saturday November 7, This Saturday: 1 of 22 live, 12 pending, 9 draft".
 */
export function columnLabel(week: RailWeek, today?: string, visibleDate: string = week.label): string {
  const when = week.saturday
    ? `${visibleDate}, weekend of ${LONG_DATE.format(utcNoon(week.saturday)).replace(",", "")}`
    : week.label;
  const name = week.name ? `, ${week.name}` : "";
  const count = total(week);
  const facts =
    count === 0 ? "nothing listed" : `${week.live} of ${count} live, ${week.pending} pending, ${week.draft} draft`;
  const todayPart = today ? `. ${todayLabel(today)}` : "";
  return `${when}${name}: ${facts}${todayPart}`;
}

/** Mouse tooltip for one stall: "Emerge Holiday Market, Sat 11 am, Pending". */
export function stallTooltip(stall: RailStall): string {
  return `${stall.title}, ${stall.startLabel}, ${STATUS_WORD[stall.status]}`;
}

export const STALL_GAP = 3;

/** How many stalls of `size` fit across `width` with 3 px gaps. */
export function stallsPerRow(width: number, size: number): number {
  return Math.max(1, Math.floor((width + STALL_GAP) / (size + STALL_GAP)));
}

/**
 * Stalls shown in a block of `capacity` slots. When they do not all fit, the last two slots hold
 * the "+4" count instead.
 */
export function visibleStalls(count: number, capacity: number): { shown: number; more: number } {
  if (count <= capacity) return { shown: count, more: 0 };
  const shown = Math.max(capacity - 2, 0);
  return { shown, more: count - shown };
}

/**
 * Left offset of the today line inside the first column: weekday / 7 of the block width, snapped
 * into the nearest gap between stalls so it never cuts through one.
 */
export function todayLineLeft(weekday: number, width: number, size: number): number {
  const slot = size + STALL_GAP;
  const perRow = stallsPerRow(width, size);
  const ideal = (Math.min(Math.max(weekday, 0), 6) / 7) * width;
  const gapIndex = Math.min(Math.max(Math.round(ideal / slot), 0), perRow);
  return Math.max(gapIndex * slot - STALL_GAP / 2 - 1, 0);
}
