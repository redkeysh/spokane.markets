"use client";

import * as React from "react";
import Link from "next/link";
import { Field, FieldRow, Section } from "@/components/admin/kit/field";
import { PlaceMap } from "@/components/admin/venues/place-map";
import { realCoords } from "@/lib/venues/match";
import { EditorInput, EditorSelect, LinkButton } from "../controls";
import { useEditorForm } from "../form-context";
import { EMPTY_PLACE, type PlaceFields } from "../model";
import { NewPlaceCheck, PlaceChecks, SubmissionPlaceLine } from "../place-check";
import { placeChecks, type PlaceOption } from "../place-checks";
import { eventsHere, PlacePicker, placeLine } from "../place-picker";


function PlaceFieldsForm({
  place,
  onChange,
  readOnly,
  idPrefix,
  nameLabel = "Place name",
}: {
  place: PlaceFields;
  onChange: (place: PlaceFields) => void;
  readOnly: boolean;
  idPrefix: string;
  nameLabel?: string;
}) {
  const { errors } = useEditorForm();
  const set = (patch: Partial<PlaceFields>) => onChange({ ...place, ...patch });
  return (
    <div className="space-y-4">
      <FieldRow>
        <Field id={`${idPrefix}-name`} label={nameLabel} error={errors["place.name"]}>
          <EditorInput value={place.name} readOnly={readOnly} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field id={`${idPrefix}-street`} label="Street" error={errors["place.address"]}>
          <EditorInput value={place.address} readOnly={readOnly} autoComplete="street-address" onChange={(e) => set({ address: e.target.value })} />
        </Field>
      </FieldRow>
      <div className="grid grid-cols-[minmax(0,1fr)_72px_104px] gap-3">
        <Field id={`${idPrefix}-city`} label="City" error={errors["place.city"]}>
          <EditorInput value={place.city} readOnly={readOnly} autoComplete="address-level2" onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field id={`${idPrefix}-state`} label="State" error={errors["place.state"]}>
          <EditorInput value={place.state} readOnly={readOnly} maxLength={20} autoComplete="address-level1" onChange={(e) => set({ state: e.target.value })} />
        </Field>
        <Field id={`${idPrefix}-zip`} label="ZIP" error={errors["place.zip"]}>
          <EditorInput
            value={place.zip}
            readOnly={readOnly}
            inputMode="numeric"
            maxLength={10}
            autoComplete="postal-code"
            onChange={(e) => set({ zip: e.target.value })}
            className="tabular-nums"
          />
        </Field>
      </div>
      {errors.place && <p className="text-xs text-ponderosa">{errors.place}</p>}
    </div>
  );
}

function fromPlace(place: PlaceOption): PlaceFields {
  return { name: place.name, address: place.address, city: place.city, state: place.state, zip: place.zip };
}

function MarketField({ onMarket }: { onMarket: (marketId: string) => void }) {
  const { values, options, readOnly, errors } = useEditorForm();
  return (
    <Field id="ed-market" label="Market" help="Picking a market fills an empty place with its home." error={errors.marketId}>
      <EditorSelect value={values.marketId} disabled={readOnly} onChange={(e) => onMarket(e.target.value)}>
        <option value="">None</option>
        {options.markets.map((m) => (
          <option key={m.id} value={m.id} disabled={m.archived && m.id !== values.marketId}>
            {m.archived ? `${m.name} (archived)` : m.name}
          </option>
        ))}
      </EditorSelect>
    </Field>
  );
}

function EventWhere() {
  const { values, saved, update, options, readOnly, errors } = useEditorForm();
  const [adding, setAdding] = React.useState(() => !values.venueId && !!values.place.name);
  const selected = options.places.find((p) => p.id === values.venueId) ?? null;
  const checks = selected ? placeChecks(selected, options.alsoListedAs[selected.id]) : [];
  const coords = selected ? realCoords(selected) : null;

  return (
    <>
      {adding && !values.venueId ? (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium text-basalt">New place</p>
            {!readOnly && (
              <LinkButton
                onClick={() => {
                  setAdding(false);
                  update({ place: EMPTY_PLACE, venueId: saved.venueId });
                }}
              >
                Pick an existing place
              </LinkButton>
            )}
          </div>
          <PlaceFieldsForm idPrefix="ed-new-place" place={values.place} readOnly={readOnly} onChange={(place) => update({ place })} />
          <NewPlaceCheck
            place={values.place}
            places={options.places}
            onUse={(venueId) => {
              update({ venueId, place: EMPTY_PLACE });
              setAdding(false);
            }}
          />
        </div>
      ) : (
        <div>
          <label htmlFor="ed-place" className="block text-sm font-medium text-basalt">
            Place
          </label>
          <div className="mt-1.5">
            <PlacePicker
              id="ed-place"
              places={options.places}
              value={values.venueId}
              disabled={readOnly}
              describedBy="ed-place-about"
              invalid={!!errors.venueId}
              onPick={(place) => update({ venueId: place.id, place: EMPTY_PLACE })}
              onAddNew={(typed) => {
                setAdding(true);
                update({ venueId: "", place: { ...EMPTY_PLACE, name: typed } });
              }}
            />
          </div>
          <div id="ed-place-about" className="mt-1.5 space-y-1">
            {selected ? (
              <p className="text-sm text-ash tabular-nums">
                {placeLine(selected)}
                {selected.state ? `, ${selected.state}` : ""} {selected.zip}. {eventsHere(selected.eventCount)} here. Neighborhood:{" "}
                {selected.neighborhood ? selected.neighborhood.replace(/-/g, " ") : "none"}.{" "}
                {!selected.neighborhood && (
                  <Link href={`/admin/venues/${selected.id}`} className="rounded-sm font-medium text-lilac underline-offset-4 hover:underline">
                    Set
                  </Link>
                )}
              </p>
            ) : (
              <p className="text-sm text-ash">Choose where it happens, or add a new place.</p>
            )}
            {errors.venueId && <p className="text-xs text-ponderosa">{errors.venueId}</p>}
            <PlaceChecks checks={checks} />
          </div>
        </div>
      )}
      <MarketField
        onMarket={(marketId) => {
          const market = options.markets.find((m) => m.id === marketId);
          const fillPlace = !values.venueId && !adding && market?.venueId && options.places.some((p) => p.id === market.venueId);
          update(fillPlace ? { marketId, venueId: market!.venueId! } : { marketId });
        }}
      />
      {coords && selected && (
        <PlaceMap
          pins={[{ lat: coords.lat, lng: coords.lng, title: selected.name }]}
          label={`Map of ${selected.name}, ${placeLine(selected)}`}
          zoom={15}
          className="h-[140px]"
        />
      )}
    </>
  );
}

function SubmissionWhere() {
  const { values, update, options, readOnly, context, saved } = useEditorForm();
  const pickerRef = React.useRef<HTMLInputElement>(null);
  const submission = context.submission;
  return (
    <>
      <div>
        <label htmlFor="ed-place-pick" className="block text-sm font-medium text-basalt">
          Use an existing place
        </label>
        <div className="mt-1.5">
          <PlacePicker
            id="ed-place-pick"
            inputRef={pickerRef}
            places={options.places}
            value=""
            disabled={readOnly}
            placeholder="Search places to copy their address"
            onPick={(place) => update({ place: fromPlace(place) })}
          />
        </div>
      </div>
      <PlaceFieldsForm idPrefix="ed-sub-place" place={values.place} readOnly={readOnly} onChange={(place) => update({ place })} />
      {submission?.status === "PENDING" && (
        <SubmissionPlaceLine
          place={values.place}
          saved={saved.place}
          outcome={submission.outcome}
          places={options.places}
          readOnly={readOnly}
          onChange={(place) => update({ place })}
          onPickAnother={() => pickerRef.current?.focus()}
        />
      )}
      <MarketField
        onMarket={(marketId) => {
          const market = options.markets.find((m) => m.id === marketId);
          const home = market?.venueId ? options.places.find((p) => p.id === market.venueId) : null;
          const empty = !values.place.name.trim() && !values.place.address.trim();
          update(empty && home ? { marketId, place: fromPlace(home) } : { marketId });
        }}
      />
    </>
  );
}

/** Place (picker, check line, map) and market. */
export function WhereSection() {
  const { mode } = useEditorForm();
  return (
    <Section id="where" title="Where">
      {mode === "submission" ? <SubmissionWhere /> : <EventWhere />}
    </Section>
  );
}
