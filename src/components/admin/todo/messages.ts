import { addDays, formatShortDate, weekdayIndex } from "@/lib/admin/format";
import type { RailWeek } from "@/lib/admin/weekends";
import { listAnd } from "./brief-model";

type Done = { changed: string[]; alreadyThere: string[]; refused: { id: string; reason: string }[]; notified: string[] };

type TitleOf = (id: string) => string;

function firstNames(names: string[]): string[] {
  return names.map((n) => n.trim().split(/\s+/)[0] ?? n);
}

function told(notified: string[]): string {
  return notified.length ? ` Told ${listAnd(firstNames(notified))}.` : "";
}

function refusedText(refused: Done["refused"], titleOf: TitleOf): string {
  if (refused.length === 0) return "";
  if (refused.length === 1) return ` ${titleOf(refused[0].id)} stays off the site. ${refused[0].reason}`;
  return ` ${refused.length} stay off the site until their places are complete.`;
}

/** "Published 8. 1 was already live. Told Dana." */
export function publishMessage(result: Done, titleOf: TitleOf): string {
  const n = result.changed.length;
  const head = n === 0 ? "Nothing was published." : n === 1 ? `Published ${titleOf(result.changed[0])}.` : `Published ${n}.`;
  const already = result.alreadyThere.length
    ? ` ${result.alreadyThere.length} ${result.alreadyThere.length === 1 ? "was" : "were"} already live.`
    : "";
  return `${head}${already}${refusedText(result.refused, titleOf)}${told(result.notified)}`;
}

/** "Kept CardCon off the site." or "Rejected 17: Not a market or fair." */
export function rejectMessage(result: Done, titleOf: TitleOf, reason: string): string {
  const n = result.changed.length;
  const head =
    n === 0 ? "Nothing was rejected." : n === 1 ? `Kept ${titleOf(result.changed[0])} off the site.` : `Rejected ${n}: ${reason}.`;
  const already = result.alreadyThere.length
    ? ` ${result.alreadyThere.length} ${result.alreadyThere.length === 1 ? "was" : "were"} already rejected.`
    : "";
  return `${head}${already}${told(result.notified)}`;
}

export function archiveMessage(archived: string[], titleOf: TitleOf): string {
  if (archived.length === 0) return "Nothing was archived.";
  return archived.length === 1 ? `Archived ${titleOf(archived[0])}.` : `Archived ${archived.length}.`;
}

/** "Kept Rebel Junk Holiday Market and published it. Archived its twin." */
export function keepMessage(keptTitle: string, published: boolean, archived: number, notified: string[]): string {
  const copies = archived === 1 ? "its twin" : `${archived} copies`;
  return `Kept ${keptTitle}${published ? " and published it" : ""}. Archived ${copies}.${told(notified)}`;
}

/** "Set aside until tomorrow." or "Set aside until Monday, Nov 9." */
export function laterMessage(until: "tomorrow" | "next-monday", today: string): string {
  if (until === "tomorrow") return "Set aside until tomorrow.";
  const monday = addDays(today, 7 - weekdayIndex(today));
  return `Set aside until Monday, ${formatShortDate(monday)}.`;
}

/** "Nov 7 is now 9 of 22 live.", counting the newly live stalls of the week. */
export function weekLiveSentence(week: RailWeek | undefined, nowLive: string[]): string {
  if (!week) return "";
  const added = new Set(nowLive);
  const newly = week.stalls.filter((s) => added.has(s.id) && s.status !== "PUBLISHED").length;
  const total = week.live + week.pending + week.draft;
  if (total === 0) return "";
  const live = Math.min(week.live + newly, total);
  return `${week.label} is now ${live} of ${total} live.`;
}
