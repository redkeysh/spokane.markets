"use client";

import * as React from "react";
import Link from "next/link";
import { AdminButton } from "@/components/admin/kit/button";
import { checkPlaceAction, checkSubmissionPlaceAction, type PlaceCheckResult } from "@/app/admin/_actions/editor";
import type { VenueOutcome } from "@/lib/submissions/venue-outcome";
import { cn } from "@/lib/utils";
import { EditorInput, LinkButton } from "./controls";
import { fixCapitals, isShouting, type PlaceFields } from "./model";
import type { PlaceCheck, PlaceOption } from "./place-checks";
import { eventsHere } from "./place-picker";

/** The place check line: errors in ponderosa, things to know in ash, each with its one action. */
export function PlaceChecks({ checks, id }: { checks: PlaceCheck[]; id?: string }) {
  if (checks.length === 0) return null;
  return (
    <ul id={id} className="space-y-1">
      {checks.map((check) => (
        <li key={check.message} className={cn("text-sm", check.kind === "error" ? "text-ponderosa" : "text-ash")}>
          {check.message}
          {check.action && (
            <>
              {" "}
              <Link href={check.action.href} className="rounded-sm font-medium text-lilac underline-offset-4 hover:underline">
                {check.action.label}
              </Link>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function filled(place: PlaceFields): boolean {
  return !!(place.name.trim() && place.address.trim() && place.city.trim() && place.state.trim() && place.zip.trim());
}

/**
 * Runs the server's place matcher on a place typed in by hand before anything is added: an existing
 * place to use instead, or the nearest existing one when it would be new.
 */
export function NewPlaceCheck({
  place,
  places,
  onUse,
}: {
  place: PlaceFields;
  places: readonly PlaceOption[];
  onUse: (venueId: string) => void;
}) {
  const [result, setResult] = React.useState<{ for: string; value: PlaceCheckResult } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const key = JSON.stringify(place);
  const current = result && result.for === key ? result.value : null;

  const check = React.useCallback(async () => {
    setBusy(true);
    try {
      setResult({ for: key, value: await checkPlaceAction(JSON.parse(key) as PlaceFields) });
    } finally {
      setBusy(false);
    }
  }, [key]);

  // The matcher runs on its own once every part is filled and typing pauses.
  const complete = filled(place);
  React.useEffect(() => {
    if (!complete) return;
    const timer = window.setTimeout(() => void check(), 900);
    return () => window.clearTimeout(timer);
  }, [complete, check]);

  return (
    <div className="space-y-2" aria-live="polite">
      {!current && (
        <AdminButton variant="outline" size="sm" busy={busy} busyLabel="Checking" disabled={!filled(place)} onClick={() => void check()}>
          Check this place
        </AdminButton>
      )}
      {current?.status === "existing" && (
        <p className="text-sm text-basalt">
          {current.archived ? `This matches an archived place, ${current.name}. ` : `${current.name} already exists at ${current.address}. `}
          {current.archived ? (
            <Link href={`/admin/venues/${current.venueId}`} className="font-medium text-lilac underline-offset-4 hover:underline">
              Open the place
            </Link>
          ) : (
            <LinkButton onClick={() => onUse(current.venueId)}>Use it</LinkButton>
          )}
        </p>
      )}
      {current?.status === "new" && (
        <div className="space-y-1 text-sm">
          <p className="text-basalt">No place matches. It is added when you save.</p>
          {current.nearest && places.some((p) => p.id === current.nearest!.venueId) && (
            <p className="text-ash tabular-nums">
              The nearest existing place is {current.nearest.name}, {current.nearest.meters} m away.{" "}
              <LinkButton onClick={() => onUse(current.nearest!.venueId)}>Use that instead</LinkButton>
            </p>
          )}
        </div>
      )}
      {current?.status === "unplaceable" && (
        <p className="text-sm text-ponderosa">No map can find this address. Check the street, city, state and ZIP.</p>
      )}
      {current?.status === "error" && <p className="text-sm text-ponderosa">{current.error}</p>}
    </div>
  );
}

const PART_FIELD: Record<string, keyof PlaceFields> = { name: "name", street: "address", city: "city", state: "state", ZIP: "zip" };
const PART_LABEL: Record<string, string> = { name: "Place name", street: "Street", city: "City", state: "State", ZIP: "ZIP" };

/**
 * What publishing a submission does with its place, from the same matcher approval uses: reuses an
 * existing place, adds a new one, stops on an archived one, or cannot publish yet. Fixed inline.
 */
export function SubmissionPlaceLine({
  place,
  saved,
  outcome,
  places,
  onChange,
  onPickAnother,
  readOnly,
}: {
  place: PlaceFields;
  /** The place fields the outcome was worked out for. */
  saved: PlaceFields;
  outcome: VenueOutcome | null;
  places: readonly PlaceOption[];
  onChange: (place: PlaceFields) => void;
  onPickAnother: () => void;
  readOnly: boolean;
}) {
  const [checked, setChecked] = React.useState<{ for: string; value: VenueOutcome | { outcome: "error"; error: string } } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const key = JSON.stringify(place);
  const fresh = checked && checked.for === key ? checked.value : JSON.stringify(saved) === key ? outcome : null;
  const shouting = [place.name, place.address, place.city].some(isShouting);

  const recheck = async () => {
    setBusy(true);
    try {
      setChecked({ for: key, value: await checkSubmissionPlaceAction(place) });
    } finally {
      setBusy(false);
    }
  };

  const fixButton =
    shouting && !readOnly ? (
      <LinkButton
        onClick={() => onChange({ ...place, name: fixCapitals(place.name), address: fixCapitals(place.address), city: fixCapitals(place.city) })}
      >
        Fix capitals
      </LinkButton>
    ) : null;

  const lastKnown = checked?.value ?? outcome;
  const stillIncomplete = !fresh && lastKnown?.outcome === "incomplete";
  if (!fresh && !stillIncomplete) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-live="polite">
        <p className="text-ash">You changed the place since it was last checked.</p>
        {!readOnly && (
          <AdminButton variant="outline" size="sm" busy={busy} busyLabel="Checking" onClick={() => void recheck()}>
            Check again
          </AdminButton>
        )}
        {fixButton}
      </div>
    );
  }

  const shown = (fresh ?? lastKnown)!;
  let body: React.ReactNode;
  switch (shown.outcome) {
    case "existing": {
      const count = places.find((p) => p.id === shown.venueId)?.eventCount ?? 0;
      body = (
        <p className="text-basalt">
          Uses {shown.name}, {shown.address} ({eventsHere(count).toLowerCase()}). {fixButton}
        </p>
      );
      break;
    }
    case "new": {
      const nearest = shown.nearest && places.find((p) => p.id === shown.nearest!.venueId);
      body = (
        <div className="space-y-1">
          <p className="text-basalt">
            Adds a new place: {place.name}, {place.address}. {fixButton}
          </p>
          {shown.nearest && nearest && (
            <p className="text-ash tabular-nums">
              The nearest existing place is {shown.nearest.name}, {shown.nearest.meters} m away.{" "}
              {!readOnly && (
                <LinkButton onClick={() => onChange({ name: nearest.name, address: nearest.address, city: nearest.city, state: nearest.state, zip: nearest.zip })}>
                  Use that instead
                </LinkButton>
              )}
            </p>
          )}
        </div>
      );
      break;
    }
    case "archived":
      body = (
        <p className="text-ponderosa">
          Matches an archived place, {shown.name}.{" "}
          <Link href={`/admin/venues/${shown.venueId}`} className="font-medium text-lilac underline-offset-4 hover:underline">
            Restore it
          </Link>{" "}
          or{" "}
          <LinkButton onClick={onPickAnother} disabled={readOnly}>
            Pick another
          </LinkButton>
        </p>
      );
      break;
    case "incomplete":
      body = (
        <div className="space-y-2">
          <p className="text-ponderosa">Can&apos;t publish yet: no {shown.missing.join(", no ")}.</p>
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-3">
              {shown.missing.map((part) => {
                const field = PART_FIELD[part];
                if (!field) return null;
                return (
                  <label key={part} className="flex items-center gap-2 text-sm text-basalt">
                    {PART_LABEL[part]}
                    <EditorInput
                      value={place[field]}
                      onChange={(e) => onChange({ ...place, [field]: e.target.value })}
                      className={part === "ZIP" || part === "state" ? "w-24" : "w-56"}
                      inputMode={part === "ZIP" ? "numeric" : undefined}
                    />
                  </label>
                );
              })}
              {!fresh && (
                <AdminButton variant="outline" size="sm" busy={busy} busyLabel="Checking" onClick={() => void recheck()}>
                  Check again
                </AdminButton>
              )}
            </div>
          )}
        </div>
      );
      break;
    case "unplaceable":
      body = <p className="text-ponderosa">No map can find this address, so it can&apos;t be published yet. Check the street, city, state and ZIP.</p>;
      break;
    default:
      body = <p className="text-ponderosa">{shown.error}</p>;
  }
  return (
    <div className="text-sm" aria-live="polite">
      {body}
    </div>
  );
}
