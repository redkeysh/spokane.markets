"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { publishLabel } from "@/lib/admin/decisions/kinds/shared";
import { StatusMark, type MarkStatus } from "@/components/admin/kit/status-mark";
import { listAnd } from "../brief-model";
import { DecisionActions, DecisionHeader, useStandardActions, type ActionSpec } from "../decision-parts";
import { compareRows, decisionEvents, editorHref, fixedCopy, suggestReason, takeFromOthers, type CompareRow } from "../decision-model";
import type { DecisionPaneProps } from "../kind-registry";
import { useDecisionKeys, useTodo } from "../todo-context";
import type { TodoEvent } from "../types";

const STATUS: Record<string, MarkStatus> = { PUBLISHED: "PUBLISHED", PENDING: "PENDING", DRAFT: "DRAFT" };

function CopyHeading({ event, number, href }: { event: TodoEvent; number: number; href: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-start gap-2">
        <span aria-hidden="true" className="text-sm font-semibold text-ash tabular-nums">
          {number}
        </span>
        <span className="min-w-0 text-sm font-semibold text-basalt">
          <span className="sr-only">Copy {number}: </span>
          {event.title}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <StatusMark status={STATUS[event.status] ?? "PENDING"} size="sm" />
        {href && (
          <a href={href} className="inline-flex h-6 items-center text-xs font-medium text-lilac underline-offset-2 hover:underline">
            Open {number}
          </a>
        )}
      </span>
    </div>
  );
}

/** Side by side from 640 px: a label column, one column per copy, and "differs" on the right. */
function CompareTable({ events, rows, hrefs }: { events: TodoEvent[]; rows: CompareRow[]; hrefs: (string | null)[] }) {
  return (
    <table className="hidden w-full table-fixed border-collapse text-sm sm:table">
      <caption className="sr-only">The copies side by side. Rows that differ say so.</caption>
      <colgroup>
        <col className="w-[88px]" />
        {events.map((e) => (
          <col key={e.id} />
        ))}
        <col className="w-16" />
      </colgroup>
      <thead>
        <tr className="border-b border-seam align-bottom">
          <th scope="col" className="py-2 pr-3 text-left">
            <span className="sr-only">Field</span>
          </th>
          {events.map((e, i) => (
            <th key={e.id} scope="col" className="py-2 pr-4 text-left font-normal">
              <CopyHeading event={e} number={i + 1} href={hrefs[i]} />
            </th>
          ))}
          <th scope="col" className="py-2 text-left">
            <span className="sr-only">Differs</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.field} className={cn("border-b border-seam align-top", row.differs && "bg-honey-tint")}>
            <th scope="row" className="whitespace-nowrap py-2 pr-2 pl-2 text-left font-medium text-ash">
              {row.label}
            </th>
            {row.values.map((value, i) => (
              <td key={events[i].id} className="break-words py-2 pr-4 text-basalt">
                {value}
              </td>
            ))}
            <td className="py-2 pr-2 text-right text-xs font-medium text-honey-text">{row.differs ? "differs" : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** On phones each field is a row: the field name, then each version under it. */
function CompareStack({ events, rows, hrefs }: { events: TodoEvent[]; rows: CompareRow[]; hrefs: (string | null)[] }) {
  return (
    <div className="sm:hidden">
      <ol className="mb-3 space-y-2">
        {events.map((e, i) => (
          <li key={e.id}>
            <CopyHeading event={e} number={i + 1} href={hrefs[i]} />
          </li>
        ))}
      </ol>
      <dl className="border-t border-seam">
        {rows.map((row) => (
          <div key={row.field} className={cn("border-b border-seam px-2 py-2", row.differs && "bg-honey-tint")}>
            <dt className="flex justify-between text-sm font-medium text-ash">
              {row.label}
              {row.differs && <span className="text-xs text-honey-text">differs</span>}
            </dt>
            {row.values.map((value, i) => (
              <dd key={events[i].id} className="mt-1 flex gap-2 text-sm text-basalt">
                <span className="w-4 shrink-0 text-ash tabular-nums">{i + 1}</span>
                <span className="min-w-0 break-words">{value}</span>
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Same event twice (or more): the copies side by side, rows that differ marked. 1 or 2 keeps that
 * copy and publishes it, Shift with the number keeps it without publishing; the others are
 * archived as its duplicates so the next import skips them. With a live copy, P keeps the live
 * one. D remembers they are different events.
 */
export function TwinDecision({ decision, position }: DecisionPaneProps) {
  const api = useTodo();
  const { later } = useStandardActions(decision);
  const events = decisionEvents(decision, api.events);
  const maybe = decision.kind === "maybe-twins";
  const fixed = fixedCopy(decision, events);
  const suggested = fixed ?? events.find((e) => e.id === decision.suggestedKeepId) ?? events[0];
  const settles = new Set(decision.settles);
  const [take, setTake] = React.useState(true);
  const busy = api.busy === decision.key;
  const anyBusy = api.busy !== null;
  const takeId = React.useId();

  const keep = (event: TodoEvent | undefined, publish: boolean) => {
    if (!event) return;
    if (fixed && event.id !== fixed.id) {
      api.announce(`${fixed.status === "PUBLISHED" ? "The live copy" : "Copy " + (events.indexOf(fixed) + 1)} stays. Press P to keep it, or D if these are different events.`);
      return;
    }
    const others = events.filter((o) => o.id !== event.id);
    const archiveIds = others.filter((o) => settles.has(o.id)).map((o) => o.id);
    if (archiveIds.length === 0) return;
    void api.keepOne(decision, {
      keepId: event.id,
      archiveIds,
      publish: publish && event.status !== "PUBLISHED",
      takeFromOthers: take && event.id === suggested?.id && takeFromOthers(event, others).length > 0,
    });
  };

  const bindings: Record<string, () => void> = {
    p: () => {
      if (fixed) keep(fixed, false);
      else if (maybe) api.announce("Choose the copy to keep with its number, or press D if these are different events.");
      else keep(suggested, true);
    },
    d: () => void api.different(decision),
  };
  events.slice(0, 9).forEach((e, i) => {
    bindings[String(i + 1)] = () => keep(e, true);
    bindings[`shift+${i + 1}`] = () => keep(e, false);
  });
  useDecisionKeys(bindings);

  if (events.length < 2 || !suggested) {
    return <DecisionHeader title={decision.title} meta={position} context="One of these copies changed since the page loaded." />;
  }

  const rows = compareRows(events);
  const hrefs = events.map((e) => editorHref(decision, e.id));
  const others = events.filter((e) => e.id !== suggested.id);
  const names = takeFromOthers(suggested, others);
  const number = (e: TodoEvent) => events.indexOf(e) + 1;
  const first = events[0];
  const placesDiffer = new Set(events.map((e) => e.venue.id)).size > 1;

  const actions: ActionSpec[] = fixed
    ? [
        {
          label: decision.primary.label,
          keys: "P",
          variant: "ink",
          onClick: () => keep(fixed, false),
          disabled: anyBusy,
          busy,
          busyLabel: "Archiving",
        },
      ]
    : events.slice(0, 9).map((e) => ({
        label: publishLabel(`Keep ${number(e)} and publish`, e.notifies ? [e.notifies] : []),
        keys: String(number(e)),
        variant: !maybe && e.id === suggested.id ? ("publish" as const) : ("outline" as const),
        onClick: () => keep(e, true),
        disabled: anyBusy,
        busy: busy && e.id === suggested.id,
        busyLabel: "Publishing",
      }));
  actions.push({ label: "Different events", keys: "D", onClick: () => void api.different(decision), disabled: anyBusy });
  if (later) actions.push(later);

  const suggestion = fixed
    ? `${fixed.status === "PUBLISHED" ? "The live copy" : `Copy ${number(fixed)}`} stays. ${listAnd(
        events.filter((e) => settles.has(e.id)).map((e) => String(number(e)))
      )} will be archived as ${settles.size === 1 ? "its duplicate" : "its duplicates"}, so the next import skips ${settles.size === 1 ? "it" : "them"}.`
    : maybe
      ? `These might be the same event. If one is fuller, it is ${number(suggested)}: ${suggestReason(suggested, others)}.`
      : `Suggested: keep ${number(suggested)}, ${suggestReason(suggested, others)}.`;

  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader
        title={maybe ? "Maybe the same event?" : "Same event twice?"}
        meta={position}
        context={`${first.dateRange}, ${first.venue.name}${first.venue.city ? `, ${first.venue.city}` : ""}${placesDiffer ? ", at two places listed separately" : ""}`}
      />
      <CompareTable events={events} rows={rows} hrefs={hrefs} />
      <CompareStack events={events} rows={rows} hrefs={hrefs} />
      <div className="mt-4 max-w-[72ch] space-y-2 text-sm">
        <p className="text-basalt">{suggestion}</p>
        {names.length > 0 && (
          <label htmlFor={takeId} className="flex min-h-6 cursor-pointer items-start gap-2">
            <input
              id={takeId}
              type="checkbox"
              checked={take}
              onChange={(e) => setTake(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-basalt"
            />
            <span>
              Also take {listAnd(names)} from {listAnd(others.map((o) => String(number(o))))}
              {fixed ? "" : ` when keeping ${number(suggested)}`}
            </span>
          </label>
        )}
      </div>
      <DecisionActions actions={actions} />
    </article>
  );
}
