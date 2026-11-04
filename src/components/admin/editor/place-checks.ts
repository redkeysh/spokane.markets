/**
 * The place check line under the place picker: things about a place the
 * owner should know before publishing. Pure.
 */
import { missingVenueParts } from "@/lib/events/readiness";
import { findTown, TOWNS } from "@/lib/admin/regions";
import { addressProblems, pinProblem, type PlaceCheckKind } from "@/lib/venues/place-check";

export type PlaceOption = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  neighborhood: string | null;
  /** Events at this place that are not archived. */
  eventCount: number;
  archived?: boolean;
};

export type PlaceCheck = {
  kind: "error" | "check";
  message: string;
  action?: { label: string; href: string };
};

function words(text: string): string {
  return ` ${text
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** The known town a place name mentions, when it is not the town the place is in. */
export function otherTownInName(name: string, city: string): string | null {
  const here = findTown(city)?.name ?? city.trim();
  const hereWords = words(here);
  const nameWords = words(name);
  const mentioned = TOWNS.filter((town) => nameWords.includes(words(town.name)))
    .map((town) => town.name)
    .sort((a, b) => b.length - a.length)[0];
  if (!mentioned) return null;
  const mentionedWords = words(mentioned);
  if (hereWords.includes(mentionedWords) || mentionedWords.includes(hereWords)) return null;
  return mentioned;
}

/** The pin sentence in the editor's words; the Venues checks decide which one applies. */
const PIN_WORDS: Partial<Record<PlaceCheckKind, string>> = {
  "no-pin": "This place has no spot on the map yet.",
  "default-pin": "This place is still on the default downtown pin.",
  "outside-area": "This place's pin is outside the Spokane and North Idaho area.",
};

/** Everything worth saying about the chosen place, errors first. Town, ZIP and pin follow the Venues checks. */
export function placeChecks(place: PlaceOption, alsoListedAs: readonly string[] = []): PlaceCheck[] {
  const checks: PlaceCheck[] = [];
  const page = `/admin/venues/${place.id}`;
  if (place.archived) {
    checks.push({ kind: "error", message: `${place.name} is archived. Pick another place, or restore it first.`, action: { label: "Open the place", href: page } });
  }
  const missing = missingVenueParts(place);
  if (missing.length > 0) {
    checks.push({ kind: "error", message: `Can't publish yet: the place has no ${missing.join(", no ")}.`, action: { label: "Fix the place", href: page } });
  }
  const other = otherTownInName(place.name, place.city);
  if (other) checks.push({ kind: "check", message: `${place.name} is in ${findTown(place.city)?.name ?? place.city}, not ${other}.` });
  for (const problem of addressProblems(place)) checks.push({ kind: "check", message: problem.message, action: { label: "Fix the place", href: page } });
  const pin = pinProblem(place);
  if (pin) checks.push({ kind: "check", message: PIN_WORDS[pin.kind] ?? pin.message, action: { label: "Find on map", href: page } });
  if (alsoListedAs.length > 0) {
    checks.push({
      kind: "check",
      message: `This place is also listed as ${alsoListedAs.slice(0, 2).join(" and ")}${alsoListedAs.length > 2 ? ` and ${alsoListedAs.length - 2} more` : ""}.`,
      action: { label: "Merge places", href: "/admin/venues?view=duplicates" },
    });
  }
  return checks;
}
