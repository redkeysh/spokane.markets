import type { VenueOutcome } from "@/lib/submissions/venue-outcome";
import type { TodoPlaceLine } from "./types";

type SubmissionPlace = {
  venueName: string;
  venueAddress: string;
  venueCity: string | null;
  venueState: string | null;
  venueZip: string | null;
};

/** The parts venueOutcome requires, in the words the submission pane names them. */
const PARTS = [
  ["venueName", "name"],
  ["venueAddress", "street"],
  ["venueCity", "city"],
  ["venueState", "state"],
  ["venueZip", "ZIP"],
] as const;

export function missingPlaceParts(row: SubmissionPlace): string[] {
  return PARTS.filter(([key]) => !row[key]?.trim()).map(([, word]) => word);
}

/** What approving a submission does with its place, in plain words. */
export function placeLineOf(outcome: VenueOutcome): TodoPlaceLine {
  switch (outcome.outcome) {
    case "existing":
      return { outcome: "existing", text: `Uses ${outcome.name}, ${outcome.address}.` };
    case "new": {
      const nearest = outcome.nearest;
      const text = nearest
        ? `Adds a new place. The nearest existing place is ${nearest.name}, ${nearest.meters} m away.`
        : "Adds a new place at this address.";
      return { outcome: "new", text, nearest: nearest ?? undefined };
    }
    case "archived":
      return { outcome: "archived", text: `Matches an archived place, ${outcome.name}. Restore it or pick another place before publishing.` };
    case "incomplete":
      return { outcome: "incomplete", text: `Can't publish yet: no ${outcome.missing.join(", no ")}.`, missing: outcome.missing };
    case "unplaceable":
      return { outcome: "unplaceable", text: "Can't publish yet: this address cannot be found on the map. Fix the street, city or ZIP." };
  }
}

/** A place that matches no saved place yet: finding it on the map happens when its decision opens. */
export function uncheckedPlaceLine(row: SubmissionPlace): TodoPlaceLine {
  return { outcome: "unknown", text: `${row.venueName}, ${row.venueAddress}. Checking the address on the map.` };
}

export function failedPlaceLine(row: SubmissionPlace): TodoPlaceLine {
  return { outcome: "unknown", text: `${row.venueName}, ${row.venueAddress}. The place could not be checked just now.` };
}
