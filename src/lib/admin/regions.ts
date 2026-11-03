/**
 * Towns the site covers, the area each belongs to, and the order they are
 * met driving I-90 east from Cheney, Washington towns before Idaho ones.
 */

export type Area = "Spokane" | "Spokane Valley" | "North Idaho" | "Farther out";

export const AREAS: Area[] = ["Spokane", "Spokane Valley", "North Idaho", "Farther out"];

export type Town = { name: string; state: "WA" | "ID"; area: Area };

/** In I-90 order: Washington towns along the interstate, outlying Washington towns, then Idaho. */
export const TOWNS: Town[] = [
  { name: "Cheney", state: "WA", area: "Farther out" },
  { name: "Airway Heights", state: "WA", area: "Farther out" },
  { name: "Medical Lake", state: "WA", area: "Farther out" },
  { name: "Spokane", state: "WA", area: "Spokane" },
  { name: "Mead", state: "WA", area: "Spokane" },
  { name: "Colbert", state: "WA", area: "Spokane" },
  { name: "Millwood", state: "WA", area: "Spokane Valley" },
  { name: "Spokane Valley", state: "WA", area: "Spokane Valley" },
  { name: "Liberty Lake", state: "WA", area: "Spokane Valley" },
  { name: "Chewelah", state: "WA", area: "Farther out" },
  { name: "Newport", state: "WA", area: "Farther out" },
  { name: "Addy", state: "WA", area: "Farther out" },
  { name: "Sprague", state: "WA", area: "Farther out" },
  { name: "Post Falls", state: "ID", area: "North Idaho" },
  { name: "Coeur d'Alene", state: "ID", area: "North Idaho" },
  { name: "Hayden", state: "ID", area: "North Idaho" },
  { name: "Rathdrum", state: "ID", area: "North Idaho" },
  { name: "Athol", state: "ID", area: "North Idaho" },
  { name: "Spirit Lake", state: "ID", area: "North Idaho" },
  { name: "Blanchard", state: "ID", area: "North Idaho" },
];

/** Misspellings seen in venue records, keyed like townKey. */
const TOWN_ALIASES: Record<string, string> = {
  postfalles: "Post Falls",
  cda: "Coeur d'Alene",
  couerdalene: "Coeur d'Alene",
  coeurdalenne: "Coeur d'Alene",
  spokanevly: "Spokane Valley",
};

/** Letters only, lowercase: "Coeur d' Alene" and "COEUR D'ALENE" give "coeurdalene". */
function townKey(city: string): string {
  return city
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const TOWNS_BY_KEY = new Map(TOWNS.map((town) => [townKey(town.name), town]));

/** The known town a city value names, tolerant of case, spacing and the misspellings above. */
export function findTown(city: string | null | undefined): Town | null {
  if (!city) return null;
  const key = townKey(city);
  const alias = TOWN_ALIASES[key];
  return TOWNS_BY_KEY.get(alias ? townKey(alias) : key) ?? null;
}

/** The canonical spelling of a known town, or the trimmed input. */
export function townName(city: string): string {
  return findTown(city)?.name ?? city.trim();
}

function normalizeState(state: string | null | undefined): "WA" | "ID" | null {
  const key = (state ?? "").trim().toLowerCase();
  if (key === "wa" || key === "washington") return "WA";
  if (key === "id" || key === "idaho") return "ID";
  return null;
}

/** The area of a place. An unknown Idaho town is North Idaho; any other unknown town is Farther out. */
export function areaOf(city: string | null | undefined, state?: string | null): Area {
  const town = findTown(city);
  if (town) return town.area;
  return normalizeState(state) === "ID" ? "North Idaho" : "Farther out";
}

/** The state of a place: the known town's state, else the normalized state field. */
export function stateOf(city: string | null | undefined, state?: string | null): "WA" | "ID" | null {
  return findTown(city)?.state ?? normalizeState(state);
}

/** Position in I-90 order; unknown towns sort after every known one. */
export function townOrder(city: string | null | undefined): number {
  const town = findTown(city);
  return town ? TOWNS.indexOf(town) : TOWNS.length;
}

/** Sorts places by town in I-90 order, then by town name for unknown towns. */
export function compareTowns(a: string, b: string): number {
  return townOrder(a) - townOrder(b) || townName(a).localeCompare(townName(b));
}
