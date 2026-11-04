import { findTown, townName } from "@/lib/admin/regions";
import { DEFAULT_PIN, realCoords } from "./match";

/** Eastern Washington and North Idaho: every place the site lists lies inside this box. */
export const SERVICE_AREA = { minLat: 46, maxLat: 49, minLng: -119, maxLng: -115.5 } as const;

/**
 * ZIP codes of the towns the site covers and the town names a place in each may use. Spokane
 * Valley ZIPs also accept "Spokane", the postal city many records use there.
 */
export const ZIP_TOWNS: Record<string, readonly string[]> = {
  "99001": ["Airway Heights"],
  "99004": ["Cheney"],
  "99005": ["Colbert"],
  "99016": ["Spokane Valley"],
  "99019": ["Liberty Lake"],
  "99021": ["Mead"],
  "99022": ["Medical Lake"],
  "99032": ["Sprague"],
  "99037": ["Spokane Valley"],
  "99101": ["Addy"],
  "99109": ["Chewelah"],
  "99156": ["Newport"],
  "99201": ["Spokane"],
  "99202": ["Spokane"],
  "99203": ["Spokane"],
  "99204": ["Spokane"],
  "99205": ["Spokane"],
  "99206": ["Spokane Valley", "Spokane"],
  "99207": ["Spokane"],
  "99208": ["Spokane"],
  "99212": ["Spokane Valley", "Millwood", "Spokane"],
  "99216": ["Spokane Valley", "Spokane"],
  "99217": ["Spokane", "Spokane Valley"],
  "99218": ["Spokane"],
  "99223": ["Spokane"],
  "99224": ["Spokane"],
  "83801": ["Athol"],
  "83804": ["Blanchard"],
  "83814": ["Coeur d'Alene"],
  "83815": ["Coeur d'Alene"],
  "83816": ["Coeur d'Alene"],
  "83835": ["Hayden"],
  "83854": ["Post Falls"],
  "83858": ["Rathdrum"],
  "83869": ["Spirit Lake"],
};

export type PlaceCheckKind = "no-pin" | "default-pin" | "outside-area" | "zip-town" | "zip-state" | "town-state";

export type PlaceProblem = { kind: PlaceCheckKind; message: string };

export type CheckablePlace = {
  name?: string;
  city: string;
  state: string;
  zip: string;
  lat?: number | null;
  lng?: number | null;
};

function zip5(zip: string): string {
  return zip.trim().slice(0, 5);
}

/** The state a ZIP belongs to, for the two states the site covers. */
export function zipState(zip: string): "WA" | "ID" | null {
  const z = zip5(zip);
  if (!/^\d{5}$/.test(z)) return null;
  if (z.startsWith("99")) return "WA";
  if (z.startsWith("83")) return "ID";
  return null;
}

function stateCode(state: string): "WA" | "ID" | null {
  const key = state.trim().toLowerCase();
  if (key === "wa" || key === "washington") return "WA";
  if (key === "id" || key === "idaho") return "ID";
  return null;
}

/** The pin: missing, still the form's default spot, or outside the service area. */
export function pinProblem(place: Pick<CheckablePlace, "lat" | "lng">): PlaceProblem | null {
  if (place.lat == null || place.lng == null || Number.isNaN(place.lat) || Number.isNaN(place.lng) || (place.lat === 0 && place.lng === 0)) {
    return { kind: "no-pin", message: "It has no pin on the map." };
  }
  if (realCoords(place) === null) {
    return {
      kind: "default-pin",
      message: `The pin is still at the default spot (${DEFAULT_PIN.lat}, ${DEFAULT_PIN.lng}) downtown, not at the place.`,
    };
  }
  const { lat, lng } = place;
  if (lat < SERVICE_AREA.minLat || lat > SERVICE_AREA.maxLat || lng < SERVICE_AREA.minLng || lng > SERVICE_AREA.maxLng) {
    return { kind: "outside-area", message: "The pin is outside the Spokane and North Idaho area." };
  }
  return null;
}

/**
 * Town, ZIP and state that disagree: "City Spokane, but ZIP 99022 is Medical Lake." Only ZIPs in
 * ZIP_TOWNS and known towns are judged; anything else passes.
 */
export function addressProblems(place: CheckablePlace): PlaceProblem[] {
  const problems: PlaceProblem[] = [];
  const zip = zip5(place.zip);
  const town = findTown(place.city);
  const allowed = ZIP_TOWNS[zip];
  if (town && allowed && !allowed.includes(town.name)) {
    problems.push({ kind: "zip-town", message: `City ${place.city.trim()}, but ZIP ${zip} is ${allowed[0]}.` });
  }
  const state = stateCode(place.state);
  const byZip = zipState(zip);
  if (state && byZip && state !== byZip) {
    problems.push({ kind: "zip-state", message: `State ${place.state.trim()}, but ZIP ${zip} is in ${byZip === "WA" ? "Washington" : "Idaho"}.` });
  } else if (state && town && town.state !== state) {
    problems.push({
      kind: "town-state",
      message: `State ${place.state.trim()}, but ${townName(place.city)} is in ${town.state === "WA" ? "Washington" : "Idaho"}.`,
    });
  }
  return problems;
}

/** Everything the place check line reports, pin first. */
export function checkPlace(place: CheckablePlace): PlaceProblem[] {
  const pin = pinProblem(place);
  return [...(pin ? [pin] : []), ...addressProblems(place)];
}
