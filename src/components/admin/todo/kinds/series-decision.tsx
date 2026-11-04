"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { saturdayOf } from "@/lib/admin/format";
import { publishLabel } from "@/lib/admin/decisions/kinds/shared";
import { AdminButton } from "@/components/admin/kit/button";
import { StatusMark, type MarkStatus } from "@/components/admin/kit/status-mark";
import { useRail } from "@/components/admin/shell/rail-context";
import { ImageUploadWithUrl } from "@/components/image-upload-with-url";
import {
  applyToSeriesDates,
  linkSeriesToMarket,
  makeSeriesMarket,
  mergeSeriesPlace,
  publishSeries,
  seriesDecisionDetails,
  type SeriesDetails,
} from "@/app/admin/_actions/twins-series";
import { DecisionActions, DecisionHeader, useStandardActions, type ActionSpec } from "../decision-parts";
import { decisionEvents, notifySentence } from "../decision-model";
import type { DecisionPaneProps } from "../kind-registry";
import { publishMessage, weekLiveSentence } from "../messages";
import { weekKeyOf } from "../pile-model";
import { useDecisionKeys, useDirty, useTodo } from "../todo-context";
import type { TodoEvent } from "../types";
import { addressSentence, seriesSummary } from "./series-model";

const STATUS: Record<string, MarkStatus> = { PUBLISHED: "PUBLISHED", PENDING: "PENDING", DRAFT: "DRAFT" };

/** "Kendall Yards Christmas Market" from "Kendall Yards Christmas Market, 6 dates". */
function seriesName(title: string): string {
  return title.replace(/, \d+ dates$/, "").trim();
}

/** "12:00 to 4:00 pm" for one day, "Fri 10:00 am to Sun 6:00 pm" for several. */
function hoursOf(e: TodoEvent): string {
  return e.dates.length === 1 ? e.whenShort.replace(/^[A-Z][a-z]{2} /, "") : e.whenShort;
}

/** "4 weekends" when dates run over several days or share weekends, else "3 dates". */
function spanWords(events: TodoEvent[]): string {
  const weekends = new Set(events.map((e) => saturdayOf(e.firstDate))).size;
  const multiDay = events.some((e) => e.dates.length > 1);
  if (multiDay || weekends < events.length) return `${weekends} ${weekends === 1 ? "weekend" : "weekends"}`;
  return `${events.length} dates`;
}

/** The dates with a tick each: one tab stop for the list, Up and Down move, Space ticks. */
function DateRows({
  events,
  name,
  unticked,
  onToggle,
}: {
  events: TodoEvent[];
  name: string;
  unticked: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const [active, setActive] = React.useState(0);
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const current = Math.min(active, Math.max(events.length - 1, 0));
  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(Math.max(current + delta, 0), events.length - 1);
    setActive(next);
    refs.current[next]?.focus();
  };
  return (
    <ul role="list" aria-label={`Dates of ${name}`} onKeyDown={onKeyDown} className="border-t border-seam">
      {events.map((e, i) => {
        const ticked = !unticked.has(e.id);
        const other = e.title.trim() !== name;
        const blocking = e.blocking[0]?.message;
        return (
          <li key={e.id} className="border-b border-seam">
            <label
              className={cn(
                "grid cursor-pointer grid-cols-[24px_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 py-2 pr-2 sm:grid-cols-[24px_11rem_minmax(0,1fr)_auto]",
                !ticked && "text-ash"
              )}
            >
              <span className="flex h-5 items-center justify-center">
                <input
                  ref={(node) => {
                    refs.current[i] = node;
                  }}
                  type="checkbox"
                  checked={ticked}
                  tabIndex={i === current ? 0 : -1}
                  onFocus={() => setActive(i)}
                  onChange={() => onToggle(e.id)}
                  className="size-4 cursor-pointer accent-basalt"
                />
              </span>
              <span className={cn("col-start-2 text-sm font-medium tabular-nums sm:col-start-auto", ticked ? "text-basalt" : "text-ash")}>
                {e.dateRange}
              </span>
              <span className="col-start-2 min-w-0 text-sm tabular-nums sm:col-start-auto">
                <span className="block">{hoursOf(e)}</span>
                {other && <span className="block text-xs text-ash">{e.title}</span>}
                {blocking && <span className="block text-xs text-honey-text">{blocking}</span>}
              </span>
              <span className="col-start-2 sm:col-start-auto">
                <StatusMark status={STATUS[e.status] ?? "PENDING"} size="sm" />
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Check({
  checked,
  onChange,
  disabled,
  children,
  action,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <label htmlFor={id} className={cn("flex min-h-6 max-w-[72ch] flex-1 basis-72 items-start gap-2", disabled ? "cursor-default text-ash" : "cursor-pointer")}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-basalt disabled:cursor-default"
        />
        <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
      </label>
      {action && <span className="flex shrink-0 gap-2">{action}</span>}
    </li>
  );
}

type Loaded = { key: string; details: SeriesDetails | null };

/**
 * One event on several dates: every date with a tick, what they share, what is worth fixing
 * before they go live (web addresses that name another event, one picture for all, the place
 * listed twice), and the market they belong to or could join. P publishes the ticked dates with
 * the ticked fixes, E opens the first date with "Apply changes to all dates" chosen.
 */
export function SeriesDecision({ decision, position }: DecisionPaneProps) {
  const api = useTodo();
  const { rail } = useRail();
  const { later } = useStandardActions(decision);
  const events = decisionEvents(decision, api.events);
  const name = seriesName(decision.title);
  const [unticked, setUnticked] = React.useState<ReadonlySet<string>>(new Set());
  const [fixAddresses, setFixAddresses] = React.useState(true);
  const [picture, setPicture] = React.useState<string | null>(null);
  const [usePicture, setUsePicture] = React.useState(false);
  const [choosing, setChoosing] = React.useState(false);
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [version, setVersion] = React.useState(0);
  const details = loaded?.key === decision.key ? loaded.details : undefined;

  React.useEffect(() => {
    let live = true;
    const key = decision.key;
    void seriesDecisionDetails({ eventIds: decision.settles })
      .then((result) => {
        if (live) setLoaded({ key, details: result });
      })
      .catch(() => {
        if (live) setLoaded({ key, details: null });
      });
    return () => {
      live = false;
    };
  }, [decision.key, decision.settles, version]);

  const ticked = events.filter((e) => !unticked.has(e.id));
  const ids = ticked.map((e) => e.id);
  const notifies = [...new Set(ticked.map((e) => e.notifies).filter((n): n is string => !!n))];
  const busy = api.busy === decision.key;
  const anyBusy = api.busy !== null;
  const all = ticked.length === events.length;
  const summary = seriesSummary(events);
  const addresses = (details?.addresses ?? []).filter((a) => ids.includes(a.eventId));
  const blockedAddress = addresses.find((a) => a.problem);
  const fixes = {
    fixAddresses: fixAddresses && addresses.length > 0 && !blockedAddress,
    ...(usePicture && picture ? { imageUrl: picture } : {}),
  };
  const titleOf = (id: string) => api.events[id]?.title ?? "It";

  const save = async () => {
    if (!ids.length || (!fixes.fixAddresses && !fixes.imageUrl)) return true;
    const ok = await api.run(
      decision,
      () => applyToSeriesDates({ decisionKey: decision.key, eventIds: ids, ...fixes }),
      () => ({ text: `Saved on ${ids.length === 1 ? "the ticked date" : `all ${ids.length} ticked dates`}.`, keep: true })
    );
    if (ok) {
      setPicture(null);
      setUsePicture(false);
      setVersion((v) => v + 1);
    }
    return ok;
  };
  useDirty(usePicture && picture ? 1 : 0, save);

  const toggle = (id: string) =>
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const needOne = () => api.announce("Tick at least one date first.");

  const publish = () => {
    if (details === undefined) return api.announce("Still checking web addresses and places.");
    if (!ids.length) return needOne();
    const week = rail.weeks.find((w) => w.key === weekKeyOf(decision.lane));
    void api.run(
      decision,
      () => publishSeries({ decisionKey: decision.key, eventIds: ids, ...fixes }),
      (r) => {
        const text = publishMessage(r, titleOf);
        const sentence = r.changed.length ? weekLiveSentence(week, r.changed) : "";
        return { text, spoken: sentence ? `${text} ${sentence}` : text, live: r.changed, keep: r.changed.length === 0 && r.alreadyThere.length === 0 };
      }
    );
  };
  const reject = () => {
    if (!ids.length) return needOne();
    api.openReject({
      decision,
      title: ids.length === 1 ? `Keep ${ticked[0].title} off the site?` : `Keep these ${ids.length} dates off the site?`,
      titles: ticked.map((e) => `${e.title}, ${e.dateRange}`),
      count: ids.length,
      notifies,
      run: (reason) => api.rejectEvents(decision, ids, reason),
    });
  };
  const after = () => setVersion((v) => v + 1);
  const retry = () => {
    setLoaded(null);
    setVersion((v) => v + 1);
  };
  // Linking, making a market and merging the place change the series' key; `follow` keeps the
  // cursor on these dates when the refreshed pile files them under the new key.
  const allIds = events.map((e) => e.id);
  const linkTo = (market: { id: string; name: string }) =>
    void api
      .run(
        decision,
        () => linkSeriesToMarket({ decisionKey: decision.key, eventIds: allIds, marketId: market.id }),
        (r) => ({ text: `Linked ${r.changed.length === 1 ? "1 date" : `${r.changed.length} dates`} to ${market.name}.`, keep: true, follow: allIds })
      )
      .then(after);
  const makeMarket = () =>
    void api
      .run(
        decision,
        () => makeSeriesMarket({ decisionKey: decision.key, eventIds: allIds }),
        (r) => ({ text: `Made the market ${details?.draft?.name ?? name} and linked ${r.changed.length} dates to it.`, keep: true, follow: allIds })
      )
      .then(after);
  const mergePlace = (place: NonNullable<SeriesDetails["place"]>) =>
    void api
      .run(
        decision,
        () => mergeSeriesPlace({ decisionKey: decision.key, keepId: place.keep.id, mergeIds: place.mergeIds }),
        () => ({ text: `Merged the place into ${place.keep.name}.`, keep: true, follow: allIds })
      )
      .then(after);

  useDecisionKeys({
    p: publish,
    x: reject,
    a: () => setUnticked(new Set()),
    "shift+a": () => setUnticked(new Set(events.map((e) => e.id))),
    "mod+s": () => void save(),
  });

  if (events.length === 0) {
    return <DecisionHeader title={name} meta={position} context="These dates are no longer waiting. They may have been changed elsewhere." />;
  }

  const first = events[0];
  const market = details?.market ?? null;
  const placeLine = `${first.venue.name}${first.venue.city ? `, ${first.venue.city}` : ""}.`;
  const marketLine = market ? ` Part of ${market.name}${market.verified ? ", verified" : ""}.` : first.marketName ? ` Part of ${first.marketName}.` : "";
  const count = events.length;
  const publishText = all ? publishLabel(`Publish ${count} dates`, notifies) : publishLabel(ids.length === 1 ? "Publish 1 date" : `Publish ${ids.length} dates`, notifies);

  const actions: ActionSpec[] = [
    { label: publishText, keys: "P", variant: "publish", onClick: publish, disabled: anyBusy || !ids.length || details === undefined, busy, busyLabel: "Publishing" },
    { label: `Edit all ${count}`, keys: "E", onClick: () => api.openEditor(decision), disabled: anyBusy },
    { label: "Reject", keys: "X", variant: "danger-outline", onClick: reject, disabled: anyBusy || !ids.length },
  ];
  if (later) actions.push(later);

  const place = details?.place ?? null;
  const pictureNeeded = summary.withPicture < count;
  const fixItems = (addresses.length > 0 ? 1 : 0) + (pictureNeeded ? 1 : 0) + (place ? 1 : 0);

  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader title={name} meta={<span>{count} dates</span>} context={`${placeLine}${marketLine}`} />
      <p className="sr-only">{position}</p>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ash">
        <span className="tabular-nums">
          {ticked.length} of {count} ticked
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={() => setUnticked(new Set())}
            className="inline-flex h-6 items-center rounded-sm px-1 font-medium text-lilac hover:bg-hover"
          >
            Tick all
          </button>
          <button
            type="button"
            onClick={() => setUnticked(new Set(events.map((e) => e.id)))}
            className="inline-flex h-6 items-center rounded-sm px-1 font-medium text-lilac hover:bg-hover"
          >
            Tick none
          </button>
        </span>
      </div>
      <DateRows events={events} name={name} unticked={unticked} onToggle={toggle} />

      {(summary.same || summary.differs) && (
        <div className="mt-4 max-w-[72ch] space-y-1 text-sm text-basalt">
          {summary.same && <p>{summary.same}</p>}
          {summary.differs && <p className="text-ash">{summary.differs}</p>}
        </div>
      )}

      {!market && !first.marketName && details && (
        <div className="mt-4 flex max-w-[72ch] flex-wrap items-start justify-between gap-x-4 gap-y-2 text-sm text-basalt">
          {details.suggestedMarket ? (
            <>
              <p className="flex-1 basis-72">
                {name} looks like part of {details.suggestedMarket.name}: same place, similar name.
              </p>
              <AdminButton size="sm" variant="outline" disabled={anyBusy} onClick={() => linkTo(details.suggestedMarket!)}>
                Link {count} dates
              </AdminButton>
            </>
          ) : (
            <>
              <div className="flex-1 basis-72">
                <p>
                  {name}, {spanWords(events)} at {first.venue.name}, has no market.
                </p>
                {details.draft && (
                  <p className="mt-0.5 text-xs text-ash">
                    Makes {details.draft.name} at {details.draft.venueName}
                    {details.draft.typicalSchedule ? `, ${details.draft.typicalSchedule}` : ""}, and links the {count} dates to it.
                  </p>
                )}
              </div>
              <AdminButton size="sm" variant="outline" disabled={anyBusy} onClick={makeMarket}>
                Make a market
              </AdminButton>
            </>
          )}
        </div>
      )}

      <section aria-labelledby="series-fix-heading" className="mt-6">
        <h3 id="series-fix-heading" className="font-text text-[15px]/[20px] font-semibold text-basalt">
          Worth fixing first
        </h3>
        {details === null && (
          <div className="mt-2 flex max-w-[72ch] flex-wrap items-start justify-between gap-x-4 gap-y-2 text-sm">
            <p className="flex-1 basis-72 text-basalt">Could not check web addresses, places and markets.</p>
            <AdminButton size="sm" variant="outline" disabled={anyBusy} onClick={retry}>
              Try again
            </AdminButton>
          </div>
        )}
        {details === undefined ? (
          <p className="mt-2 text-sm text-ash">Checking web addresses and places.</p>
        ) : fixItems === 0 ? (
          details && (
            <p className="mt-2 text-sm text-ash">Nothing. Web addresses match the titles, every date has a picture and the place is listed once.</p>
          )
        ) : (
          <ul role="list" className="mt-3 max-w-[72ch] space-y-3 text-sm text-basalt">
            {addresses.length > 0 && (
              <Check checked={fixes.fixAddresses} disabled={!!blockedAddress} onChange={setFixAddresses}>
                {addressSentence(addresses)}
                {blockedAddress && <span className="mt-0.5 block text-xs text-ponderosa">{blockedAddress.problem}</span>}
              </Check>
            )}
            {pictureNeeded && (
              <>
                <Check
                  checked={usePicture && !!picture}
                  disabled={!picture}
                  onChange={setUsePicture}
                  action={
                    <AdminButton size="sm" variant="outline" aria-expanded={choosing} onClick={() => setChoosing((v) => !v)}>
                      {choosing ? "Close" : picture ? "Change picture" : "Choose picture"}
                    </AdminButton>
                  }
                >
                  Add one picture to {count === 2 ? "both dates" : `all ${count}`}
                  {summary.withPicture > 0 ? `; ${summary.withPicture} already ${summary.withPicture === 1 ? "has one" : "have one"} and would take it too` : ""}.
                  {!picture && <span className="mt-0.5 block text-xs text-ash">Choose a picture to tick this.</span>}
                </Check>
                {choosing && (
                  <li className="max-w-md pl-6">
                    <ImageUploadWithUrl
                      value={picture ?? ""}
                      onChange={(url) => {
                        setPicture(url || null);
                        setUsePicture(!!url);
                      }}
                      uploadType="event"
                      label="Upload a picture"
                      aspectRatio="banner"
                    />
                  </li>
                )}
              </>
            )}
            {place && (
              <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pl-6">
                <p className="max-w-[66ch] flex-1 basis-72">
                  {place.keep.id === place.id
                    ? `${place.name} is also listed as ${place.others.join(" and ")}.`
                    : `The place is a duplicate of ${place.keep.name}${place.keep.marketHome ? ", the market's home" : ""}.`}
                </p>
                <AdminButton size="sm" variant="outline" disabled={anyBusy} onClick={() => mergePlace(place)}>
                  Merge places
                </AdminButton>
              </li>
            )}
          </ul>
        )}
      </section>

      <DecisionActions
        actions={actions}
        note={
          <>
            <p>{notifySentence(notifies)}</p>
            {usePicture && picture && (
              <p className="font-medium text-basalt" role="status">
                1 unsaved change
              </p>
            )}
          </>
        }
      />
    </article>
  );
}
