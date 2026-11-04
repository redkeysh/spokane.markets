import { weekdayIndex } from "@/lib/admin/format";
import { findFacts, statedHours } from "@/lib/events/description-facts";
import { daysOf, splitIntoDailyHours, type HeldDay } from "../held-edits";
import type { TodoEvent } from "../types";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** The vendor columns a fact can set from To do; the editor sets the rest. */
export type FactDetails = { vendorApplicationState?: "OPEN" | "CLOSED"; feeModelVendor?: string };

/**
 * Daily hours with the hours the description states for a date or weekday: its own daily hours
 * stay for the days the description does not mention, and an event stored as one stretch starts
 * from splitIntoDailyHours' proposal. `stated` says whether the description gave any.
 */
export function proposeHours(
  event: Pick<TodoEvent, "startIso" | "endIso" | "dates" | "description" | "scheduleDays">,
  description: string | null = event.description
): { days: HeldDay[]; stated: boolean } {
  const base = event.scheduleDays.length ? daysOf(event) : splitIntoDailyHours(event);
  const year = Number(event.dates[0]?.slice(0, 4)) || undefined;
  const hours = statedHours(description, { year });
  let stated = false;
  const days = base.map((day) => {
    const weekday = WEEKDAYS[weekdayIndex(day.date)];
    const match = hours.find((h) => h.date === day.date) ?? hours.find((h) => !h.date && h.weekday === weekday);
    if (!match) return day;
    stated = true;
    return { date: day.date, allDay: false, startTime: match.startTime, endTime: match.endTime };
  });
  return { days, stated };
}

/** Takes a sentence out of a description and tidies the spaces it leaves. */
export function removeSentence(description: string, sentence: string): string {
  return description
    .replace(sentence, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

export type FactChip =
  | { key: string; label: string; kind: "note" }
  | { key: string; label: string; kind: "feature"; featureId: string }
  | { key: string; label: string; kind: "details"; details: FactDetails; pressed: boolean }
  | { key: string; label: string; kind: "remove"; sentence: string }
  | { key: string; label: string; kind: "hours"; days: HeldDay[] };

function sameDays(a: HeldDay[], b: HeldDay[]): boolean {
  return a.length === b.length && a.every((d, i) => d.date === b[i].date && d.allDay === b[i].allDay && d.startTime === b[i].startTime && d.endTime === b[i].endTime);
}

/**
 * "Found in the text" for a decision pane, read from the description as it stands with held
 * edits: each chip changes held values only when pressed, and a chip whose change is already
 * there is left out (or shows pressed).
 */
export function factChips(
  event: Pick<TodoEvent, "startIso" | "endIso" | "dates" | "description" | "features" | "scheduleDays" | "vendorApplicationState" | "feeModelVendor">,
  held: { description: string | null; featureIds: string[] | null; details: FactDetails; days: HeldDay[] | null },
  features: { id: string; name: string }[]
): FactChip[] {
  const description = held.description ?? event.description;
  const year = Number(event.dates[0]?.slice(0, 4)) || undefined;
  const featureIds = held.featureIds ?? event.features.map((f) => f.id);
  const chips: FactChip[] = [];
  findFacts(description, { year }).forEach((fact, i) => {
    const key = `${fact.kind}-${i}`;
    switch (fact.kind) {
      case "free-admission": {
        const feature = features.find((f) => /^free admission$/i.test(f.name.trim()));
        if (feature && !featureIds.includes(feature.id)) chips.push({ key, label: `Free admission: add ${feature.name}`, kind: "feature", featureId: feature.id });
        break;
      }
      case "admission-price":
        chips.push({ key, label: `Admission: ${fact.text}`, kind: "note" });
        break;
      case "vendor-applications": {
        const state = fact.state === "open" ? "OPEN" : "CLOSED";
        if (event.vendorApplicationState === state) break;
        chips.push({ key, label: `Vendor applications: ${fact.state}`, kind: "details", details: { vendorApplicationState: state }, pressed: held.details.vendorApplicationState === state });
        break;
      }
      case "booth-fee":
        if ((event.feeModelVendor ?? "").trim() === fact.text) break;
        chips.push({ key, label: `Booth fee: ${fact.text}`, kind: "details", details: { feeModelVendor: fact.text }, pressed: held.details.feeModelVendor === fact.text });
        break;
      case "application-deadline":
        chips.push({ key, label: `Applications close: ${fact.text}`, kind: "note" });
        break;
      case "importer-note":
        chips.push({ key, label: `Remove "${fact.sentence}"`, kind: "remove", sentence: fact.sentence });
        break;
      case "hours": {
        const proposal = proposeHours(event, description);
        const current = held.days ?? event.scheduleDays.map((d) => ({ date: d.date, allDay: d.allDay, startTime: d.startTime, endTime: d.endTime }));
        if (proposal.stated && !sameDays(proposal.days, current)) chips.push({ key, label: "Use the hours it states", kind: "hours", days: proposal.days });
        break;
      }
    }
  });
  return chips;
}
