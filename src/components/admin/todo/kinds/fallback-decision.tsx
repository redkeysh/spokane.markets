"use client";

import Link from "next/link";
import { formatDay } from "@/lib/admin/format";
import { StatusMark, type MarkStatus } from "@/components/admin/kit/status-mark";
import { DecisionActions, DecisionHeader, useStandardActions, type ActionSpec } from "../decision-parts";
import { editorHref } from "../decision-model";
import type { DecisionPaneProps } from "../kind-registry";
import { useTodo } from "../todo-context";

const STATUS: Record<string, MarkStatus> = { PUBLISHED: "PUBLISHED", PENDING: "PENDING", DRAFT: "DRAFT" };

/**
 * Any decision kind without a pane of its own yet (series, items from the public): its rows,
 * each with Open, and Later. It never publishes.
 */
export function FallbackDecision({ decision, position }: DecisionPaneProps) {
  const api = useTodo();
  const { later } = useStandardActions(decision);
  const actions: ActionSpec[] = [];
  const first = editorHref(decision);
  if (first) actions.push({ label: decision.rows.length > 1 ? "Open the first" : "Open", keys: "E", variant: "ink", onClick: () => api.openEditor(decision), disabled: api.busy !== null });
  if (later) actions.push(later);

  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader
        title={decision.title}
        meta={position}
        context={decision.detail ?? "Open each one to decide it; this kind cannot be decided from here yet."}
      />
      <ul role="list" className="border-t border-seam">
        {decision.rows.map((row) => {
          const event = row.type === "event" ? api.events[row.id] : undefined;
          const href = editorHref(decision, row.id);
          const status = row.status ? STATUS[row.status] : undefined;
          return (
            <li key={`${row.type}:${row.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-seam py-2">
              {row.firstDate && <span className="w-28 shrink-0 text-sm text-ash tabular-nums">{formatDay(row.firstDate, api.now)}</span>}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-basalt">{row.title ?? event?.title ?? row.id}</span>
                {event && <span className="block text-xs text-ash">{[event.venue.name, event.venue.city].filter(Boolean).join(", ")}</span>}
              </span>
              {status && <StatusMark status={status} size="sm" />}
              {href && (
                <Link href={href} className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-lilac hover:bg-hover">
                  Open
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <DecisionActions actions={actions} />
    </article>
  );
}
