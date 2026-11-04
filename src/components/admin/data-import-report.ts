import { countWord, joinWords } from "@/components/admin/rare/words";

export type ImportReportInput = {
  venuesCreated: number;
  venuesRemoved?: number;
  marketsCreated: number;
  eventsCreated: number;
  eventsNeedingSchedule?: { row: number; title: string; slug: string }[];
  errors: string[];
};

/** The import result as sentences, in the order the owner reads them. */
export function importReport(result: ImportReportInput): {
  made: string;
  removed: string | null;
  needsHours: string | null;
  errors: string | null;
} {
  const parts = [
    result.eventsCreated > 0 ? countWord(result.eventsCreated, "event", "events") : null,
    result.marketsCreated > 0 ? countWord(result.marketsCreated, "market", "markets") : null,
    result.venuesCreated > 0 ? countWord(result.venuesCreated, "place", "places") : null,
  ].filter((p): p is string => p !== null);
  const removed = result.venuesRemoved ?? 0;
  const hours = result.eventsNeedingSchedule?.length ?? 0;
  return {
    made: parts.length > 0 ? `Added ${joinWords(parts)}.` : "Nothing was added.",
    removed:
      removed > 0
        ? `${countWord(removed, "new place was", "new places were")} left out because nothing imported uses ${removed === 1 ? "it" : "them"}.`
        : null,
    needsHours:
      hours > 0
        ? `${countWord(hours, "event needs its", "events need their")} dates and hours set before ${hours === 1 ? "it shows" : "they show"} on the site.`
        : null,
    errors:
      result.errors.length > 0
        ? `${countWord(result.errors.length, "row", "rows")} could not be read.`
        : null,
  };
}
