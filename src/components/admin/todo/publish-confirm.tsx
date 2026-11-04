"use client";

import { formatWeekendSpan } from "@/lib/admin/format";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { lackSentence, notifySentence } from "./decision-model";
import { useTodo } from "./todo-context";
import type { Decision } from "./types";

/** "Publish 8 events for Nov 6 to 8?" with every title, its time and place, what they lack and who is told. */
export function PublishConfirm({
  request,
  onOpenChange,
  onConfirm,
}: {
  request: { decision: Decision; eventIds: string[] } | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const api = useTodo();
  const events = request ? request.eventIds.map((id) => api.events[id]).filter((e) => !!e) : [];
  const lane = request ? api.lanes.find((l) => l.lane === request.decision.lane) : null;
  const span = lane?.saturday ? formatWeekendSpan(lane.saturday, api.now) : null;
  const n = events.length;
  const notifies = [...new Set(events.map((e) => e.notifies).filter((x): x is string => !!x))];
  const lack = lackSentence(events);

  return (
    <AdminDialog
      open={!!request}
      onOpenChange={onOpenChange}
      size="list"
      title={`Publish ${n} ${n === 1 ? "event" : "events"}${span ? ` for ${span}` : ""}?`}
      footer={
        <>
          <AdminButton variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton variant="publish" onClick={onConfirm} data-autofocus>
            {notifies.length ? `Publish ${n} and tell ${notifies.length === 1 ? notifies[0].split(/\s+/)[0] : `${notifies.length} people`}` : `Publish ${n}`}
          </AdminButton>
        </>
      }
    >
      <ul role="list" className="border-t border-seam">
        {events.map((e) => (
          <li key={e.id} className="border-b border-seam py-2">
            <span className="block text-sm font-medium text-basalt">{e.title}</span>
            <span className="block text-xs text-ash">
              <span className="tabular-nums">{e.startLabel}</span>, {[e.venue.name, e.venue.city].filter(Boolean).join(", ")}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-1 text-sm text-ash">
        {lack && <p>{lack}</p>}
        <p>{notifySentence(notifies)}</p>
      </div>
    </AdminDialog>
  );
}
