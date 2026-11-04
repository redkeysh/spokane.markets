"use client";

import { AdminButton } from "@/components/admin/kit/button";
import { StatusMark } from "@/components/admin/kit/status-mark";
import { formatShortDate } from "@/lib/admin/format";
import { DecisionActions, DecisionHeader, useStandardActions, type ActionSpec } from "../decision-parts";
import { EventFields } from "../event-preview";
import { daysOf, heldDaysProblem, splitIntoDailyHours } from "../held-edits";
import { HoursEditor, PictureInput } from "../hours-editor";
import type { DecisionPaneProps } from "../kind-registry";
import { useDecisionKeys, useDirty, useTodo } from "../todo-context";
import { useEventEdits } from "./single-decision";

/**
 * A live event visitors see with something wrong: hours that close before they open or start at
 * midnight, no daily hours, an archived place, or no picture. P does the fix in place: the hours
 * editor with the bad day marked, or the picture link; saving settles the decision.
 */
export function LooksWrongDecision({ decision, position }: DecisionPaneProps) {
  const api = useTodo();
  const { edit, later } = useStandardActions(decision);
  const event = api.events[decision.rows[0]?.id ?? ""];
  const held = useEventEdits(event);
  const action = decision.primary.action;
  const fixing = held.days !== null || held.picture !== null;
  const problem = held.days ? heldDaysProblem(held.days, api.now) : null;
  const busy = api.busy === decision.key;
  const anyBusy = api.busy !== null;

  const startFix = () => {
    if (!event) return;
    if (action === "fix-hours") held.setDays(daysOf(event).length ? daysOf(event) : splitIntoDailyHours(event));
    else if (action === "add-picture") held.setPicture(event.imageUrl ?? "");
    else api.openEditor(decision);
  };

  const saveFix = async () => {
    if (!event || !held.payload) {
      api.announce("Nothing has changed yet.");
      return false;
    }
    if (problem) {
      api.announce(problem);
      return false;
    }
    const ok = await api.saveEdits(decision, event.id, held.payload, { decide: true });
    if (ok) held.reset();
    return ok;
  };
  useDirty(held.count, saveFix);

  useDecisionKeys({ p: fixing ? () => void saveFix() : startFix, "mod+s": () => void saveFix() });

  if (!event) {
    return (
      <article aria-labelledby="todo-decision-title">
        <DecisionHeader title={decision.title} meta={position} context="This event changed since the page loaded." />
      </article>
    );
  }

  const saveLabel = held.days ? "Save hours" : "Save picture";
  const actions: ActionSpec[] = fixing
    ? [
        { label: saveLabel, keys: "P", variant: "ink", onClick: () => void saveFix(), disabled: anyBusy || held.count === 0, busy, busyLabel: "Saving" },
        { label: "Cancel", variant: "quiet", onClick: held.reset, disabled: anyBusy },
      ]
    : [{ label: decision.primary.label, keys: "P", variant: "ink", onClick: startFix, disabled: anyBusy }];
  if (edit) actions.push(edit);
  if (later) actions.push(later);

  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader
        title={event.title}
        meta={
          <>
            <StatusMark status="PUBLISHED" chip />
            <span>{formatShortDate(event.firstDate)}</span>
          </>
        }
        context={/visitors see/i.test(decision.detail ?? "") ? decision.detail : `${decision.detail ?? ""} Visitors see this now.`.trim()}
      />
      <p className="sr-only">{position}</p>
      <EventFields
        event={event}
        slots={{
          when: held.days ? <HoursEditor days={held.days} onChange={held.setDays} now={api.now} /> : undefined,
          picture: held.picture !== null ? <PictureInput value={held.picture} onChange={held.setPicture} /> : undefined,
        }}
        actions={{
          tags: (
            <AdminButton size="sm" variant="quiet" onClick={() => api.openEditor(decision)}>
              Edit
            </AdminButton>
          ),
        }}
      />
      <DecisionActions
        actions={actions}
        note={
          held.count > 0 ? (
            <p className="font-medium text-basalt" role="status">
              {held.count} unsaved {held.count === 1 ? "change" : "changes"}
              {problem ? `. ${problem}` : ""}
            </p>
          ) : null
        }
      />
    </article>
  );
}
