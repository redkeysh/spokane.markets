"use client";

import Link from "next/link";
import { StatusMark, type MarkStatus } from "@/components/admin/kit/status-mark";
import { formatShortDate } from "@/lib/admin/format";
import { DecisionActions, DecisionHeader, useStandardActions, type ActionSpec } from "../decision-parts";
import { decisionEvents, editorHref } from "../decision-model";
import { EventFields } from "../event-preview";
import type { DecisionPaneProps } from "../kind-registry";
import { useDecisionKeys, useTodo } from "../todo-context";
import { readinessNote } from "./single-decision";

/** Waiting events that already happened: P archives them all (restorable). */
function GoneDecision({ decision, position }: DecisionPaneProps) {
  const api = useTodo();
  const { later } = useStandardActions(decision);
  const events = decisionEvents(decision, api.events);
  const ids = events.map((e) => e.id);
  const busy = api.busy === decision.key;
  const archive = () => void api.archive(decision, ids);
  useDecisionKeys({ p: archive });

  const actions: ActionSpec[] = [
    { label: decision.primary.label, keys: "P", variant: "ink", onClick: archive, disabled: api.busy !== null, busy, busyLabel: "Archiving" },
  ];
  if (later) actions.push(later);

  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader
        title={decision.title}
        meta={position}
        context="They ended before today and are still waiting. Archiving takes them out of every list; any of them can be restored."
      />
      <ul role="list" className="border-t border-seam">
        {events.map((e) => {
          const href = editorHref(decision, e.id);
          return (
            <li key={e.id} className="grid gap-x-3 border-b border-seam py-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
              <span className="text-sm text-ash tabular-nums">{e.dateRange}</span>
              <span className="min-w-0">
                {href ? (
                  <Link href={href} className="text-sm font-medium text-basalt underline-offset-2 hover:underline">
                    {e.title}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{e.title}</span>
                )}
                <span className="block text-xs text-ash">
                  {[e.venue.name, e.venue.city].filter(Boolean).join(", ")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <DecisionActions actions={actions} />
    </article>
  );
}

/** A submission approved under the old two-step flow whose event never went live. */
function ApprovedDecision({ decision, position }: DecisionPaneProps) {
  const api = useTodo();
  const { edit, later } = useStandardActions(decision);
  const event = api.events[decision.rows[0]?.id ?? ""];
  const busy = api.busy === decision.key;

  const publish = () => event && void api.publish(decision, [event.id]);
  const reject = () =>
    event &&
    api.openReject({
      decision,
      title: `Keep ${event.title} off the site?`,
      titles: [],
      count: 1,
      notifies: event.notifies ? [event.notifies] : [],
      run: (reason) => api.rejectEvents(decision, [event.id], reason),
    });
  useDecisionKeys({ p: publish, x: reject });

  if (!event) return <DecisionHeader title={decision.title} meta={position} />;

  const actions: ActionSpec[] = [
    { label: decision.primary.label, keys: "P", variant: "publish", onClick: publish, disabled: api.busy !== null, busy, busyLabel: "Publishing" },
    { label: "Reject", keys: "X", variant: "danger-outline", onClick: reject, disabled: api.busy !== null },
  ];
  if (edit) actions.push(edit);
  if (later) actions.push(later);
  const status = (["PENDING", "DRAFT"].includes(event.status) ? event.status : "PENDING") as MarkStatus;

  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader
        title={event.title}
        meta={
          <>
            <StatusMark status={status} chip />
            <span>{formatShortDate(event.firstDate)}</span>
          </>
        }
        context={`Approved but never published. ${decision.detail ?? ""}`.trim()}
      />
      <p className="sr-only">{position}</p>
      <EventFields event={event} />
      <DecisionActions
        actions={actions}
        note={readinessNote(event).map((line) => (
          <p key={line}>{line}</p>
        ))}
      />
    </article>
  );
}

/** Leftovers: "Already happened" (archive them) and "Approved but never published" (publish it). */
export function LeftoverDecision(props: DecisionPaneProps) {
  return props.decision.kind === "gone" ? <GoneDecision {...props} /> : <ApprovedDecision {...props} />;
}
