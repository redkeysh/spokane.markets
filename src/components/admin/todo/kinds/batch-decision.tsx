"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatDay } from "@/lib/admin/format";
import { publishLabel } from "@/lib/admin/decisions/kinds/shared";
import { REJECT_REASONS } from "@/lib/admin/reject-reasons";
import { DecisionActions, DecisionHeader, useStandardActions, type ActionSpec } from "../decision-parts";
import { decisionEvents, lackSentence, notifySentence } from "../decision-model";
import type { DecisionPaneProps } from "../kind-registry";
import { useDecisionKeys, useTodo } from "../todo-context";
import type { TodoEvent } from "../types";

const REASON_TRADE = REJECT_REASONS[0];

function placeOf(e: TodoEvent): string {
  return [e.venue.name, e.venue.city].filter(Boolean).join(", ");
}

/** At most two short flags for a batch row. */
function flagsOf(e: TodoEvent): string[] {
  const words: Record<string, string> = { "no-picture": "No picture", "picture-is-page": "Picture is a page", "no-tags": "No tags" };
  return e.warnings.map((w) => words[w.flag]).filter((w): w is string => !!w).slice(0, 2);
}

/**
 * Rows of a batch with a tick each: one tab stop for the group, Up and Down move, Space ticks.
 */
function BatchRows({
  events,
  unticked,
  onToggle,
  label,
  showDate,
  now,
}: {
  events: TodoEvent[];
  unticked: ReadonlySet<string>;
  onToggle: (id: string) => void;
  label: string;
  showDate: boolean;
  now: Date;
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
    <ul role="list" aria-label={label} onKeyDown={onKeyDown} className="border-t border-seam">
      {events.map((e, i) => {
        const ticked = !unticked.has(e.id);
        const flags = flagsOf(e);
        return (
          <li key={e.id} className="border-b border-seam">
            <label
              className={cn(
                "grid cursor-pointer grid-cols-[24px_minmax(0,1fr)] items-start gap-x-3 gap-y-0.5 py-2 pr-2",
                showDate
                  ? "sm:grid-cols-[24px_8rem_minmax(0,1fr)] xl:grid-cols-[24px_8rem_minmax(0,1fr)_minmax(0,15rem)]"
                  : "sm:grid-cols-[24px_5.5rem_minmax(0,1fr)] xl:grid-cols-[24px_5.5rem_minmax(0,1fr)_minmax(0,15rem)]",
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
              <span className="col-start-2 text-sm tabular-nums sm:col-start-auto">
                {showDate ? formatDay(e.firstDate, now) : e.startLabel}
              </span>
              <span className="col-start-2 min-w-0 sm:col-start-auto">
                <span className={cn("block text-sm font-medium", ticked ? "text-basalt" : "text-ash")}>{e.title}</span>
                <span className="block text-xs text-ash xl:hidden">{placeOf(e)}</span>
                {flags.length > 0 && (
                  <span className="block text-xs text-ash">
                    {flags.map((f, n) => (n === 0 ? f : f.toLowerCase())).join(", ")}
                  </span>
                )}
              </span>
              <span className="hidden text-sm text-ash xl:block">{placeOf(e)}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A group the owner would decide the same way: the ready batch of a weekend (P publishes after a
 * confirm listing the titles) or the listings that look like trade shows (X rejects them as not
 * a market or fair). Untick rows to leave them out; "Treat them one by one" splits the batch.
 */
export function BatchDecision({ decision, position }: DecisionPaneProps) {
  const api = useTodo();
  const { later } = useStandardActions(decision);
  const events = decisionEvents(decision, api.events);
  const trade = decision.kind === "trade-shows";
  const [unticked, setUnticked] = React.useState<ReadonlySet<string>>(new Set());
  const ticked = events.filter((e) => !unticked.has(e.id));
  const ids = ticked.map((e) => e.id);
  const notifies = [...new Set(ticked.map((e) => e.notifies).filter((n): n is string => !!n))];
  const busy = api.busy === decision.key;
  const anyBusy = api.busy !== null;
  const all = ticked.length === events.length;
  const lane = api.lanes.find((l) => l.lane === decision.lane);

  const toggle = (id: string) =>
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const needOne = () => api.announce("Tick at least one row first.");

  const publish = () => (ids.length ? api.confirmPublish(decision, ids) : needOne());
  const reject = () => {
    if (!ids.length) return needOne();
    api.openReject({
      decision,
      title: ids.length === 1 ? `Keep ${ticked[0].title} off the site?` : `Keep these ${ids.length} off the site?`,
      titles: ticked.map((e) => e.title),
      count: ids.length,
      notifies,
      defaultReason: trade ? "1" : undefined,
      run: (reason) => api.rejectEvents(decision, ids, reason),
    });
  };

  useDecisionKeys({
    p: trade ? () => api.announce("These may not be markets. X keeps them off the site; Treat them one by one to list one of them.") : publish,
    x: reject,
    a: () => setUnticked(new Set()),
    "shift+a": () => setUnticked(new Set(events.map((e) => e.id))),
  });

  const tell = notifies.length === 0 ? "" : ` and tell ${notifies.length} ${notifies.length === 1 ? "organizer" : "organizers"}`;
  const publishText = all ? decision.primary.label : publishLabel(`Publish ${ids.length}`, notifies);
  const rejectText = trade ? `Reject ${ids.length}${tell}: "${REASON_TRADE}"` : ids.length === 1 ? "Reject 1" : `Reject ${ids.length}`;

  const actions: ActionSpec[] = trade
    ? [
        { label: rejectText, keys: "X", variant: "danger-outline", onClick: reject, disabled: anyBusy || !ids.length, busy, busyLabel: "Rejecting" },
        { label: "Treat them one by one", onClick: () => api.split(decision), disabled: anyBusy },
      ]
    : [
        { label: publishText, keys: "P", variant: "publish", onClick: publish, disabled: anyBusy || !ids.length, busy, busyLabel: "Publishing" },
        { label: "Reject", keys: "X", variant: "danger-outline", onClick: reject, disabled: anyBusy || !ids.length },
        { label: "Treat them one by one", onClick: () => api.split(decision), disabled: anyBusy },
      ];
  if (later) actions.push(later);

  const lack = trade ? null : lackSentence(ticked);
  const title = trade ? `${decision.title}, not markets` : decision.title;
  const context = trade
    ? "Bridal, home and yard, golf, boat, RV, ski, card and expo shows. Untick any you want to list."
    : `${events.length} events ${lane?.span ? `for ${lane.span}` : "on later dates"}. Each has a place, dates and daily hours.`;

  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader title={title} meta={position} context={context} />
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ash">
        <span className="tabular-nums">
          {ticked.length} of {events.length} ticked
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
      <BatchRows
        events={events}
        unticked={unticked}
        onToggle={toggle}
        label={trade ? "Listings that look like trade shows" : "Events ready to publish"}
        showDate={trade}
        now={api.now}
      />
      <DecisionActions
        actions={actions}
        note={
          <>
            {lack && <p>{lack}</p>}
            <p>{notifySentence(notifies, trade ? "Rejecting" : "Publishing")}</p>
          </>
        }
      />
    </article>
  );
}
