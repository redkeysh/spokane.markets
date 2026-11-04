import { findTown } from "@/lib/admin/regions";

export type TidyField = "name" | "address" | "city" | "state" | "zip";

export type SpellingFix = { field: TidyField; before: string; after: string };

export type TidyablePlace = { name: string; address: string; city: string; state: string; zip: string };

const DIRECTIONS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
const KEEP_UPPER = new Set([...DIRECTIONS, "PO", "US", "SR", "WA", "ID", "I-90"]);

/** Collapses runs of spaces and trims. */
function tidySpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hasLetters(value: string): boolean {
  return /[a-z]/i.test(value);
}

function isAllCaps(value: string): boolean {
  return hasLetters(value) && value === value.toUpperCase() && value.replace(/[^A-Za-z]/g, "").length >= 3;
}

function capitalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/(^|[-'’])([a-z])/g, (_m, sep: string, letter: string) => `${sep}${letter.toUpperCase()}`);
}

/** "7217 W WESTBOW BLVD" to "7217 W Westbow Blvd": directions stay upper case, ordinals lower case. */
export function properCaseAddress(address: string): string {
  return tidySpaces(address)
    .split(" ")
    .map((token) => {
      if (KEEP_UPPER.has(token)) return token;
      if (/^\d+(ST|ND|RD|TH)$/.test(token)) return token.toLowerCase();
      if (/\d/.test(token)) return token;
      return capitalizeWord(token);
    })
    .join(" ");
}

/** "DEER PARK" to "Deer Park", for a town the regions list does not know. */
function properCaseTown(city: string): string {
  return tidySpaces(city).split(" ").map(capitalizeWord).join(" ");
}

/** The two-letter code for the states the site covers; other values are only trimmed and upper-cased when short. */
export function tidyState(state: string): string {
  const trimmed = tidySpaces(state);
  const key = trimmed.toLowerCase().replace(/\./g, "");
  if (key === "wa" || key === "wash" || key === "washington") return "WA";
  if (key === "id" || key === "ida" || key === "idaho") return "ID";
  return trimmed.length === 2 ? trimmed.toUpperCase() : trimmed;
}

/** A known town in its canonical spelling ("Post Falles" to "Post Falls"); an unknown one only loses shouting and extra spaces. */
export function tidyCity(city: string): string {
  const town = findTown(city);
  if (town) return town.name;
  const trimmed = tidySpaces(city);
  return isAllCaps(trimmed) ? properCaseTown(trimmed) : trimmed;
}

/** Shouted addresses in proper case, "Suit 1" to "Suite 1", extra spaces removed. */
export function tidyAddress(address: string): string {
  let next = tidySpaces(address);
  if (isAllCaps(next)) next = properCaseAddress(next);
  return next.replace(/\bSuit(?=\s+\w*\d)/g, "Suite");
}

/** A five-digit ZIP or ZIP+4 without stray spaces. */
export function tidyZip(zip: string): string {
  const compact = zip.replace(/\s+/g, "");
  return /^\d{5}(-\d{4})?$/.test(compact) ? compact : zip.trim();
}

/**
 * The spelling fixes for one place, field by field, safe to apply without judgment: case,
 * spacing, known town misspellings, state names to their codes. Names only lose extra spaces,
 * since a shouted name may be a brand.
 */
export function spellingFixes(place: TidyablePlace): SpellingFix[] {
  const proposals: [TidyField, string, string][] = [
    ["name", place.name, tidySpaces(place.name)],
    ["address", place.address, tidyAddress(place.address)],
    ["city", place.city, tidyCity(place.city)],
    ["state", place.state, tidyState(place.state)],
    ["zip", place.zip, tidyZip(place.zip)],
  ];
  return proposals.filter(([, before, after]) => after !== "" && before !== after).map(([field, before, after]) => ({ field, before, after }));
}

/** Applies fixes to a place and returns only the changed fields. */
export function applyFixes(place: TidyablePlace, fields: readonly TidyField[]): Partial<TidyablePlace> {
  const changes: Partial<TidyablePlace> = {};
  for (const fix of spellingFixes(place)) {
    if (fields.includes(fix.field)) changes[fix.field] = fix.after;
  }
  return changes;
}
