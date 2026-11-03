/**
 * Facts found in an event description (free admission, prices, vendor
 * applications, importer leaks, day and hour phrases), offered to the owner
 * as suggestions and never written on their own. Finds no facts.
 */

export type DescriptionFact =
  | { kind: "free-admission"; text: string }
  | { kind: "admission-price"; text: string }
  | { kind: "vendor-applications"; state: "open" | "closed"; text: string }
  | { kind: "booth-fee"; text: string }
  | { kind: "application-deadline"; date: string | null; text: string }
  | { kind: "importer-note"; sentence: string }
  | { kind: "hours"; days: { date: string | null; weekday: string | null; startTime: string; endTime: string }[]; text: string };

export function findFacts(_description: string | null | undefined): DescriptionFact[] {
  return [];
}
