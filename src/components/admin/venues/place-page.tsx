"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AddressAutofill } from "@mapbox/search-js-react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { Field, FieldRow, Section } from "@/components/admin/kit/field";
import { HistoryList, type HistoryListEntry } from "@/components/admin/kit/history-list";
import { PageHeader } from "@/components/admin/kit/page-header";
import { Pane, Screen } from "@/components/admin/kit/pane";
import { SaveBar, unsavedText, useSavedText } from "@/components/admin/kit/save-bar";
import { StatusMark } from "@/components/admin/kit/status-mark";
import { useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { useLeaveGuard } from "@/components/admin/shell/leave-guard";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { useShell, type LeaveTarget } from "@/components/admin/shell/shell-context";
import { formatDay } from "@/lib/admin/format";
import { DEFAULT_PIN, realCoords } from "@/lib/venues/match";
import type { NeighborhoodRow } from "@/lib/venues/neighborhood-suggest";
import { checkPlace } from "@/lib/venues/place-check";
import {
  archiveUnusedPlaces,
  findPlaceOnMap,
  mergePlaces,
  restorePlaces,
  savePlace,
  undoPlaceDecision,
  type PlaceSearchRow,
  type SavePlaceResult,
} from "@/app/admin/_actions/venues";
import { cn } from "@/lib/utils";
import { plural, usesText } from "@/lib/venues/words";
import { FieldSelect, LINK, TextArea, TextInput } from "./controls";
import { eventMark, marketMark } from "./listing-status";
import { PlaceMap } from "./place-map";
import { PlacePicker } from "./place-picker";
import { useVenueAction, VenueDecisions } from "./use-venue-action";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export type PlaceForm = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lng: number | null;
  neighborhood: string;
  parkingNotes: string;
};

export type UsedByEvent = { id: string; title: string; status: string; date: string; weekOf: string | null };
export type UsedByMarket = { id: string; name: string; verification: string };

export type PlacePageData = {
  id: string | null;
  form: PlaceForm;
  archived: boolean;
  /** ISO time the place last changed; null for a new place. */
  updatedAt: string | null;
  uses: { events: number; markets: number };
  upcoming: UsedByEvent[];
  past: UsedByEvent[];
  markets: UsedByMarket[];
  /** Active places that look like the same place. */
  lookAlikes: { id: string; name: string; address: string }[];
  history: (HistoryListEntry & { decisionId: string | null })[];
};

const FIELD_COUNT_KEYS: (keyof PlaceForm)[] = ["name", "address", "city", "state", "zip", "neighborhood", "parkingNotes"];

function changedFields(a: PlaceForm, b: PlaceForm): string[] {
  const changed: string[] = FIELD_COUNT_KEYS.filter((k) => a[k] !== b[k]);
  if (a.lat !== b.lat || a.lng !== b.lng) changed.push("pin");
  return changed;
}

function weekLabel(saturday: string, now: Date): string {
  return `Weekend of ${formatDay(saturday, now)}`;
}

/**
 * The place page (and the new place form): name and address with "Find on map", a map with a
 * draggable pin, the place check, neighborhood and parking notes, then what uses the place,
 * merging it into another place, and its history. Typed coordinates live under More settings.
 */
export function PlacePage({ data, neighborhoods, now }: { data: PlacePageData; neighborhoods: NeighborhoodRow[]; now: string }) {
  return (
    <VenueDecisions>
      <PlacePageInner data={data} neighborhoods={neighborhoods} now={now} />
    </VenueDecisions>
  );
}

function PlacePageInner({ data, neighborhoods, now }: { data: PlacePageData; neighborhoods: NeighborhoodRow[]; now: string }) {
  const router = useRouter();
  const announce = useAnnounce();
  const shell = useShell();
  const nowDate = new Date(now);
  const isNew = data.id === null;
  const [saved, setSaved] = React.useState(data.form);
  const [form, setForm] = React.useState(data.form);
  const [seen, setSeen] = React.useState(data.form);
  if (seen !== data.form) {
    setSeen(data.form);
    setSaved(data.form);
    setForm(data.form);
  }
  const [saving, setSaving] = React.useState(false);
  const [finding, setFinding] = React.useState(false);
  const [problem, setProblem] = React.useState<{ text: string; field?: string } | null>(null);
  const [match, setMatch] = React.useState<Extract<SavePlaceResult, { match: unknown }>["match"] | null>(null);
  const [leaving, setLeaving] = React.useState<LeaveTarget | null>(null);
  const [mergeTarget, setMergeTarget] = React.useState<PlaceSearchRow | null>(null);
  const { run, busy } = useVenueAction();
  const changed = changedFields(form, saved);
  const dirty = changed.length > 0;
  const checks = checkPlace({ ...form, lat: form.lat, lng: form.lng });
  const pin = form.lat !== null && form.lng !== null ? { lat: form.lat, lng: form.lng } : null;
  const mapPin = pin ?? DEFAULT_PIN;
  const placed = pin !== null && realCoords(pin) !== null;
  const active = neighborhoods.filter((n) => n.isActive || n.slug === form.neighborhood);

  const set = <K extends keyof PlaceForm>(key: K, value: PlaceForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (options: { createAnyway?: boolean; then?: LeaveTarget } = {}) => {
    setSaving(true);
    setProblem(null);
    try {
      const result = await savePlace({
        id: data.id ?? undefined,
        name: form.name,
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        lat: form.lat,
        lng: form.lng,
        neighborhood: form.neighborhood || null,
        parkingNotes: form.parkingNotes || null,
        createAnyway: options.createAnyway,
      });
      if (!result.ok) {
        if ("match" in result) {
          setMatch(result.match);
          announce(result.error);
          return false;
        }
        setProblem({ text: result.error, field: result.field });
        announce(result.error);
        return false;
      }
      setMatch(null);
      setSaved(form);
      toast(result.message);
      announce(result.message);
      if (options.then) {
        setLeaving(null);
        shell.leave(options.then);
      } else if (isNew) router.push(`/admin/venues/${result.id}`);
      return true;
    } finally {
      setSaving(false);
    }
  };

  const findOnMap = async () => {
    setFinding(true);
    try {
      const result = await findPlaceOnMap({ address: form.address, city: form.city, state: form.state, zip: form.zip });
      if (result.ok) {
        setForm((f) => ({ ...f, lat: result.lat, lng: result.lng }));
        announce("Moved the pin to the address. Save to keep it.");
      } else {
        setProblem({ text: result.error, field: "address" });
        announce(result.error);
      }
    } finally {
      setFinding(false);
    }
  };

  const back = "/admin/venues";
  useLeaveGuard(dirty, setLeaving, back);
  const savedText = useSavedText(data.updatedAt ? Date.parse(data.updatedAt) : null);

  useShortcuts({
    "mod+s": () => {
      if (!saving) void save();
    },
    escape: (event) => {
      if ((event.target as Element | null)?.closest?.("[role=dialog], [role=listbox], [role=menu]")) return;
      if (document.querySelector("[role=dialog][aria-modal=true]")) return;
      if (leaving) setLeaving(null);
      else shell.navigate(back);
    },
  });

  const errorFor = (field: string) => (problem?.field === field ? problem.text : undefined);

  const streetInput = (
    <TextInput
      id="place-address"
      value={form.address}
      onChange={(e) => set("address", e.target.value)}
      autoComplete="address-line1"
      aria-describedby={errorFor("address") ? "place-address-help place-address-error" : "place-address-help"}
      aria-invalid={errorFor("address") ? true : undefined}
      aria-required
    />
  );

  return (
    <Screen bottomBar={false} className="grid grid-rows-[minmax(0,1fr)_auto]">
      <Pane label={isNew ? "New place" : form.name || "Place"} className="h-full">
        <div className="mx-auto grid w-full max-w-[1184px] gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-8">
            <PageHeader
              back={{ href: back, label: "Back to Venues" }}
              title={isNew ? "New place" : saved.name}
              description={
                isNew
                  ? "Before it is added, it is checked against the places that exist, so the same place is not listed twice."
                  : `${saved.address}, ${saved.city}, ${saved.state} ${saved.zip}`
              }
            />

            {data.archived && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-y border-seam py-3">
                <p className="text-sm text-basalt">
                  This place is archived: it is out of every list and place picker.
                  {data.uses.events || data.uses.markets ? ` It still holds ${usesText(data.uses)}.` : ""}
                </p>
                <AdminButton
                  variant="outline"
                  busy={busy === "restore"}
                  busyLabel="Restoring"
                  onClick={() => data.id && void run("restore", () => restorePlaces({ venueIds: [data.id!] }))}
                >
                  Restore
                </AdminButton>
              </div>
            )}

            {match && (
              <div role="alert" className="space-y-3 border-y border-honey-ink bg-honey-tint px-4 py-3">
                <p className="text-sm text-honey-text">
                  {match.exact
                    ? `${match.name} already exists at ${match.address}, ${match.city}${match.archived ? ", archived" : ""}. Use it?`
                    : `${match.name} at ${match.address}, ${match.city} looks like the same place. Use it?`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <AdminButton variant="ink" size="sm" onClick={() => router.push(`/admin/venues/${match.id}`)}>
                    Use {match.name}
                  </AdminButton>
                  {!match.exact && (
                    <AdminButton variant="outline" size="sm" busy={saving} busyLabel="Adding" onClick={() => void save({ createAnyway: true })}>
                      Add it anyway
                    </AdminButton>
                  )}
                </div>
              </div>
            )}

            <Section id="place" title="Name and address">
              <Field id="place-name" label="Name" required error={errorFor("name")}>
                <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
              <div>
                <label htmlFor="place-address" className="block font-text text-sm font-medium text-basalt">
                  Street address
                </label>
                <div className="mt-1.5">
                {MAPBOX_TOKEN ? (
                  <AddressAutofill
                    accessToken={MAPBOX_TOKEN}
                    options={{ country: "US" }}
                    onRetrieve={(res) => {
                      const feature = res.features?.[0];
                      const props = (feature?.properties ?? {}) as Record<string, unknown>;
                      const text = (key: string) => (typeof props[key] === "string" ? (props[key] as string) : undefined);
                      const [lng, lat] = feature?.geometry?.coordinates ?? [];
                      setForm((f) => ({
                        ...f,
                        address: text("address_line1") ?? f.address,
                        city: text("address_level2") ?? f.city,
                        state: text("address_level1") ?? f.state,
                        zip: text("postcode") ?? f.zip,
                        ...(typeof lat === "number" && typeof lng === "number" ? { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) } : {}),
                      }));
                    }}
                  >
                    {streetInput}
                  </AddressAutofill>
                ) : (
                  streetInput
                )}
                </div>
                <p id="place-address-help" className="mt-1 text-xs text-ash">
                  Required.{MAPBOX_TOKEN ? " Suggestions appear as you type; picking one fills the town, ZIP and pin." : ""}
                </p>
                {errorFor("address") && (
                  <p id="place-address-error" className="mt-1 text-xs text-ponderosa">
                    {errorFor("address")}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_80px_110px] gap-3">
                <Field id="place-city" label="Town" required error={errorFor("city")}>
                  <TextInput value={form.city} onChange={(e) => set("city", e.target.value)} autoComplete="address-level2" />
                </Field>
                <Field id="place-state" label="State" required error={errorFor("state")}>
                  <TextInput value={form.state} onChange={(e) => set("state", e.target.value)} autoComplete="address-level1" />
                </Field>
                <Field id="place-zip" label="ZIP" required error={errorFor("zip")}>
                  <TextInput value={form.zip} onChange={(e) => set("zip", e.target.value)} autoComplete="postal-code" inputMode="numeric" className="tabular-nums" />
                </Field>
              </div>
            </Section>

            <Section id="map" title="On the map">
              <div className="flex flex-wrap items-center gap-3">
                <AdminButton variant="outline" busy={finding} busyLabel="Finding" disabled={!form.address.trim()} onClick={() => void findOnMap()}>
                  <MapPin strokeWidth={1.75} aria-hidden="true" />
                  Find on map
                </AdminButton>
                <p className="text-xs text-ash">Looks the address up and moves the pin. Drag the pin, or focus it and use the arrow keys, to fine-tune.</p>
              </div>
              <PlaceMap
                pins={[{ ...mapPin, title: form.name ? `Pin for ${form.name}` : "Pin for the new place" }]}
                onMove={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
                label={`Map of ${form.name || "the new place"}`}
                className="h-[320px] w-full"
              />
              {errorFor("pin") && <p className="text-xs text-ponderosa">{errorFor("pin")}</p>}
              <div aria-live="polite">
                {checks.length > 0 ? (
                  <ul className="space-y-1">
                    {checks.map((c) => (
                      <li key={c.kind} className="text-sm text-honey-ink">
                        {c.kind === "no-pin" && isNew ? "Not on the map yet: use Find on map, or drag the pin to the place." : c.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ash">{placed ? "The pin, town, ZIP and state agree." : ""}</p>
                )}
              </div>
            </Section>

            <Section id="details" title="Neighborhood and parking">
              <Field id="place-neighborhood" label="Neighborhood" help="Decides which area filter its events appear under on the site.">
                <FieldSelect value={form.neighborhood} onChange={(e) => set("neighborhood", e.target.value)}>
                  <option value="">No neighborhood</option>
                  {active.map((n) => (
                    <option key={n.slug} value={n.slug}>
                      {n.label}
                    </option>
                  ))}
                </FieldSelect>
              </Field>
              <Field id="place-parking" label="Parking notes" help="Shown with the place on event pages." error={errorFor("parkingNotes")}>
                <TextArea value={form.parkingNotes} onChange={(e) => set("parkingNotes", e.target.value)} rows={3} />
              </Field>
              <details className="group">
                <summary className={cn(LINK, "w-fit cursor-pointer text-sm")}>More settings</summary>
                <div className="mt-3">
                  <FieldRow>
                    <Field id="place-lat" label="Latitude">
                      <TextInput
                        type="number"
                        step="any"
                        value={form.lat ?? ""}
                        onChange={(e) => set("lat", e.target.value === "" ? null : Number(e.target.value))}
                        className="tabular-nums"
                      />
                    </Field>
                    <Field id="place-lng" label="Longitude">
                      <TextInput
                        type="number"
                        step="any"
                        value={form.lng ?? ""}
                        onChange={(e) => set("lng", e.target.value === "" ? null : Number(e.target.value))}
                        className="tabular-nums"
                      />
                    </Field>
                  </FieldRow>
                </div>
              </details>
            </Section>
          </div>

          {!isNew && <SideColumn data={data} now={nowDate} busy={busy} run={run} onMerge={setMergeTarget} />}
        </div>
      </Pane>

      <SaveBar
        dirty={dirty}
        state={dirty ? unsavedText(changed.length) : isNew ? "Not added yet" : (savedText ?? "No unsaved changes")}
        leave={
          leaving
            ? {
                saving,
                onStay: () => setLeaving(null),
                onDiscard: () => {
                  const to = leaving;
                  setLeaving(null);
                  setForm(saved);
                  shell.leave(to);
                },
                onSave: () => void save({ then: leaving }),
                saveLabel: isNew ? "Add place" : "Save",
                busyLabel: isNew ? "Adding" : "Saving",
              }
            : null
        }
      >
        <AdminButton variant="outline" keys="Esc" onClick={() => shell.navigate(back)} className="max-md:hidden">
          Cancel
        </AdminButton>
        <AdminButton
          variant={match ? "outline" : "ink"}
          keys="Ctrl+S"
          busy={saving}
          busyLabel={isNew ? "Adding" : "Saving"}
          disabled={!dirty && !isNew}
          onClick={() => void save()}
        >
          {isNew ? "Add place" : "Save"}
        </AdminButton>
      </SaveBar>

      {!isNew && data.id && (
        <AdminDialog
          open={mergeTarget !== null}
          onOpenChange={(open) => !open && setMergeTarget(null)}
          title={mergeTarget ? `Merge into ${mergeTarget.name}?` : "Merge"}
          description={
            mergeTarget
              ? `${data.uses.events || data.uses.markets ? `Its ${usesText(data.uses)} move to ${mergeTarget.name}, and ` : ""}${saved.name} is archived. ${mergeTarget.name} keeps its own name and address. You can undo it.`
              : undefined
          }
          footer={
            <>
              <AdminButton variant="outline" onClick={() => setMergeTarget(null)}>
                Cancel
              </AdminButton>
              <AdminButton
                variant="ink"
                busy={busy === "merge"}
                busyLabel="Merging"
                onClick={() =>
                  mergeTarget &&
                  void run("merge", () => mergePlaces({ keepId: mergeTarget.id, mergeIds: [data.id!], byHand: true }), {
                    onDone: () => {
                      const to = mergeTarget.id;
                      setMergeTarget(null);
                      router.push(`/admin/venues/${to}`);
                    },
                  })
                }
              >
                Merge
              </AdminButton>
            </>
          }
        />
      )}
    </Screen>
  );
}

function SideColumn({
  data,
  now,
  busy,
  run,
  onMerge,
}: {
  data: PlacePageData;
  now: Date;
  busy: string | null;
  run: ReturnType<typeof useVenueAction>["run"];
  onMerge: (row: PlaceSearchRow) => void;
}) {
  const announce = useAnnounce();
  const weeks = new Map<string, UsedByEvent[]>();
  for (const e of data.upcoming) {
    const key = e.weekOf ?? e.date;
    weeks.set(key, [...(weeks.get(key) ?? []), e]);
  }
  const decisionOf = new Map(data.history.map((h) => [h.id, h.decisionId]));
  const inUse = data.uses.events > 0 || data.uses.markets > 0;

  const editorBack = data.id ? `?from=venues&back=${encodeURIComponent(`/admin/venues/${data.id}`)}` : "";
  const eventRow = (e: UsedByEvent) => (
    <li key={e.id} className="flex items-start gap-3 py-1.5">
      <span className="w-[86px] shrink-0 pt-px text-xs text-ash tabular-nums">{formatDay(e.date, now)}</span>
      <span className="min-w-0 flex-1">
        <Link href={`/admin/events/${e.id}${editorBack}`} className="text-sm font-medium text-basalt hover:underline">
          {e.title}
        </Link>
      </span>
      <StatusMark status={eventMark(e.status)} size="sm" />
    </li>
  );

  return (
    <aside aria-label="About this place" className="min-w-0 space-y-8">
      <Section id="used-by" title="Used by">
        {!inUse && <p className="text-sm text-ash">Nothing uses this place.</p>}
        {[...weeks].map(([week, events]) => (
          <div key={week}>
            <h3 className="text-xs font-semibold text-ash">{weekLabel(week, now)}</h3>
            <ul className="divide-y divide-seam">{events.map(eventRow)}</ul>
          </div>
        ))}
        {data.markets.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-ash">{data.markets.length === 1 ? "Market" : "Markets"}</h3>
            <ul className="divide-y divide-seam">
              {data.markets.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-1.5">
                  <Link href={`/admin/markets/${m.id}`} className="text-sm font-medium text-basalt hover:underline">
                    {m.name}
                  </Link>
                  <StatusMark status={marketMark(m.verification)} size="sm" />
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.past.length > 0 && (
          <details>
            <summary className={cn(LINK, "w-fit cursor-pointer text-sm")}>Earlier, {plural(data.past.length, "event")}</summary>
            <ul className="mt-2 divide-y divide-seam">{data.past.map(eventRow)}</ul>
          </details>
        )}
      </Section>

      {data.lookAlikes.length > 0 && (
        <Section id="look-alikes" title="Looks like the same place">
          <ul className="space-y-1">
            {data.lookAlikes.map((p) => (
              <li key={p.id} className="text-sm">
                <Link href={`/admin/venues/${p.id}`} className="font-medium text-basalt hover:underline">
                  {p.name}
                </Link>
                <span className="text-ash">, {p.address}</span>
              </li>
            ))}
          </ul>
          <Link href="/admin/venues?view=duplicates" className={cn(LINK, "text-sm")}>
            Review in Duplicates
          </Link>
        </Section>
      )}

      {!data.archived && (
        <Section id="merge" title="Merge into another place">
          <PlacePicker id="merge-into" label="The place to keep" excludeIds={[data.id!]} onPick={onMerge} />
        </Section>
      )}

      {!data.archived && (
        <Section id="archive" title="Archive">
          {inUse ? (
            <p className="text-sm text-ash">In use, so it stays. Merge it into the right place to move its listings.</p>
          ) : (
            <AdminButton
              variant="outline"
              busy={busy === "archive"}
              busyLabel="Archiving"
              onClick={() => void run("archive", () => archiveUnusedPlaces({ venueIds: [data.id!] }))}
            >
              Archive this place
            </AdminButton>
          )}
        </Section>
      )}

      <Section id="history" title="History">
        <HistoryList
          entries={data.history}
          headingLevel="h3"
          stickyHeadings={false}
          onUndo={async (id) => {
            const decisionId = decisionOf.get(id);
            if (!decisionId) return;
            const result = await undoPlaceDecision(decisionId);
            if (result.ok) toast(result.message);
            else toast.error(result.message);
            announce(result.message);
          }}
        />
      </Section>
    </aside>
  );
}
