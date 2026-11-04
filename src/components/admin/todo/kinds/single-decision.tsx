"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { StatusMark, type MarkStatus } from "@/components/admin/kit/status-mark";
import { formatShortDate } from "@/lib/admin/format";
import { DecisionActions, DecisionHeader, useStandardActions, type ActionSpec } from "../decision-parts";
import { EventFields } from "../event-preview";
import { NamesPicker, PlacePicker, TitleInput } from "../field-editors";
import {
  changeCount,
  daysOf,
  editsPayload,
  heldDaysProblem,
  splitIntoDailyHours,
  titleProblem,
  type HeldDay,
  type HeldEdits,
} from "../held-edits";
import { HoursEditor, PictureInput } from "../hours-editor";
import type { DecisionPaneProps } from "../kind-registry";
import { useDecisionKeys, useDirty, useTodo } from "../todo-context";
import type { TodoEvent } from "../types";

const HOUR_FLAGS = new Set(["multi-day-no-hours", "closes-before-opens", "opens-at-midnight"]);
const PLACE_FLAGS = new Set(["place-incomplete", "place-archived"]);
const MISSING_WORDS: Record<string, string> = { "no-picture": "a picture", "no-tags": "tags", "no-features": "features" };

/** "Not in the ready batch. Runs 2 days with no daily hours." and what else is missing, in words. */
export function readinessNote(event: TodoEvent): string[] {
  const lines: string[] = [];
  if (event.blocking.length) lines.push(`Not in the ready batch. ${event.blocking.map((b) => b.message).join(" ")}`);
  const missing = event.warnings.map((w) => MISSING_WORDS[w.flag]).filter((w): w is string => !!w);
  const other = event.warnings.filter((w) => !MISSING_WORDS[w.flag]).map((w) => `${w.message}.`);
  if (missing.length) lines.push(`Also missing: ${missing.join(", ")}.`);
  lines.push(...other);
  const placeBlocks = event.blocking.some((b) => PLACE_FLAGS.has(b.flag));
  if (!placeBlocks) lines.push(event.blocking.length ? "Nothing else blocks publishing." : "Nothing blocks publishing.");
  return lines;
}

/** Held edits for one event (title, place, tags, features, hours, picture) and how many fields they change. */
export function useEventEdits(event: TodoEvent | undefined) {
  const [title, setTitle] = React.useState<string | null>(null);
  const [venueId, setVenueId] = React.useState<string | null>(null);
  const [tagIds, setTagIds] = React.useState<string[] | null>(null);
  const [featureIds, setFeatureIds] = React.useState<string[] | null>(null);
  const [days, setDays] = React.useState<HeldDay[] | null>(null);
  const [picture, setPicture] = React.useState<string | null>(null);
  const edits: HeldEdits = {
    title: title ?? undefined,
    venueId: venueId ?? undefined,
    tagIds: tagIds ?? undefined,
    featureIds: featureIds ?? undefined,
    scheduleDays: days ?? undefined,
    imageUrl: picture ?? undefined,
  };
  return {
    title,
    setTitle,
    venueId,
    setVenueId,
    tagIds,
    setTagIds,
    featureIds,
    setFeatureIds,
    days,
    setDays,
    picture,
    setPicture,
    count: event ? changeCount(event, edits) : 0,
    payload: event ? editsPayload(event, edits) : null,
    reset: () => {
      setTitle(null);
      setVenueId(null);
      setTagIds(null);
      setFeatureIds(null);
      setDays(null);
      setPicture(null);
    },
  };
}

/** The one small control at the end of a field row. `label` names the field when the text alone does not. */
function RowButton({
  children,
  label,
  onClick,
  variant = "quiet",
}: {
  children: React.ReactNode;
  label?: string;
  onClick: () => void;
  variant?: "quiet" | "outline";
}) {
  return (
    <AdminButton size="sm" variant={variant} aria-label={label} onClick={onClick}>
      {children}
    </AdminButton>
  );
}

/**
 * One waiting event: what visitors will see, why it is not in the ready batch, and its title,
 * place, tags, features, hours and picture to fix in place. Edits are held, never saved on blur:
 * P saves and publishes, X saves and rejects, Ctrl+S saves.
 */
export function SingleDecision({ decision, position }: DecisionPaneProps) {
  const api = useTodo();
  const { edit, later } = useStandardActions(decision);
  const event = api.events[decision.rows[0]?.id ?? ""];
  const held = useEventEdits(event);
  const problem = (held.days ? heldDaysProblem(held.days, api.now) : null) ?? titleProblem(held.title ?? undefined);
  const busy = api.busy === decision.key;
  const anyBusy = api.busy !== null;
  const { places, tags, features } = api.data.options;

  const save = async () => {
    if (!event || !held.payload) return true;
    if (problem) {
      api.announce(problem);
      return false;
    }
    const ok = await api.saveEdits(decision, event.id, held.payload);
    if (ok) held.reset();
    return ok;
  };
  useDirty(held.count, save);

  const editsFor = event && held.payload ? { [event.id]: held.payload } : undefined;
  const placeBlocked = event?.blocking.find((b) => PLACE_FLAGS.has(b.flag));
  const movedTo = event && held.venueId && held.venueId !== event.venue.id ? places.find((p) => p.id === held.venueId) : undefined;
  const placeIssue = movedTo ? movedTo.problem : (placeBlocked?.message ?? null);

  const publish = () => {
    if (!event) return;
    if (problem) return api.announce(problem);
    if (placeIssue) return api.announce(`${placeIssue} Choose another place, or fix this one in the editor (E).`);
    void api.publish(decision, [event.id], editsFor);
  };
  const reject = () => {
    if (!event) return;
    if (problem) return api.announce(`${problem} Fix it, or keep the old value, before rejecting.`);
    api.openReject({
      decision,
      title: `Keep ${event.title} off the site?`,
      titles: [],
      count: 1,
      notifies: event.notifies ? [event.notifies] : [],
      run: (reason) => api.rejectEvents(decision, [event.id], reason, editsFor),
    });
  };

  useDecisionKeys({ p: publish, x: reject, "mod+s": () => void save() });

  if (!event) {
    return (
      <article aria-labelledby="todo-decision-title">
        <DecisionHeader title={decision.title} meta={position} context="This event is no longer waiting. It may have been changed elsewhere." />
      </article>
    );
  }

  const hoursFlag = event.blocking.find((b) => HOUR_FLAGS.has(b.flag));
  const whenAction = held.days ? (
    <RowButton onClick={() => held.setDays(null)}>Keep the old hours</RowButton>
  ) : hoursFlag?.flag === "multi-day-no-hours" ? (
    <AdminButton size="sm" onClick={() => held.setDays(splitIntoDailyHours(event))}>
      Split into daily hours
    </AdminButton>
  ) : (
    <RowButton
      variant={hoursFlag ? "outline" : "quiet"}
      onClick={() => held.setDays(daysOf(event).length ? daysOf(event) : splitIntoDailyHours(event))}
    >
      {hoursFlag ? "Fix hours" : "Change hours"}
    </RowButton>
  );
  const whereAction =
    held.venueId === null ? (
      <RowButton
        variant={placeBlocked ? "outline" : "quiet"}
        onClick={() => held.setVenueId(places.some((p) => p.id === event.venue.id) ? event.venue.id : "")}
      >
        {placeBlocked ? "Pick another place" : "Change place"}
      </RowButton>
    ) : (
      <RowButton onClick={() => held.setVenueId(null)}>Keep the old place</RowButton>
    );
  const tagsAction =
    held.tagIds === null ? (
      <RowButton label="Edit tags" onClick={() => held.setTagIds(event.tags.map((t) => t.id))}>
        Edit
      </RowButton>
    ) : (
      <RowButton onClick={() => held.setTagIds(null)}>Keep the old tags</RowButton>
    );
  const hasAction =
    held.featureIds === null ? (
      <RowButton label="Edit features" onClick={() => held.setFeatureIds(event.features.map((f) => f.id))}>
        Edit
      </RowButton>
    ) : (
      <RowButton onClick={() => held.setFeatureIds(null)}>Keep the old features</RowButton>
    );
  const pictureAction =
    held.picture === null ? (
      <RowButton variant={event.imageUrl && !event.pictureIsPage ? "quiet" : "outline"} onClick={() => held.setPicture(event.imageUrl ?? "")}>
        {event.imageUrl ? "Replace" : "Add a picture"}
      </RowButton>
    ) : (
      <RowButton onClick={() => held.setPicture(null)}>Keep the old picture</RowButton>
    );
  const titleAction =
    held.title === null ? (
      <RowButton onClick={() => held.setTitle(event.title)}>Change title</RowButton>
    ) : (
      <RowButton onClick={() => held.setTitle(null)}>Keep the old title</RowButton>
    );

  const actions: ActionSpec[] = [
    {
      label: decision.primary.label,
      keys: "P",
      variant: "publish",
      onClick: publish,
      disabled: anyBusy || !!placeIssue,
      busy,
      busyLabel: "Publishing",
    },
    { label: "Reject", keys: "X", variant: "danger-outline", onClick: reject, disabled: anyBusy },
  ];
  if (edit) actions.push(edit);
  if (later) actions.push(later);

  const status = (["PENDING", "DRAFT", "PUBLISHED"].includes(event.status) ? event.status : "PENDING") as MarkStatus;

  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader
        title={held.title?.trim() || event.title}
        editor={held.title !== null ? <TitleInput value={held.title} onChange={held.setTitle} problem={titleProblem(held.title)} /> : undefined}
        action={titleAction}
        meta={
          <>
            <StatusMark status={status} chip />
            <span>{formatShortDate(event.firstDate)}</span>
          </>
        }
        context={`${event.dateRange}, ${event.venue.name}${event.venue.city ? `, ${event.venue.city}` : ""}`}
      />
      <p className="sr-only">{position}</p>
      <EventFields
        event={event}
        slots={{
          when: held.days ? (
            <HoursEditor
              days={held.days}
              onChange={held.setDays}
              now={api.now}
              note={hoursFlag?.flag === "multi-day-no-hours" && !event.scheduleDays.length ? "Proposed from its start and end. Check them before saving." : undefined}
            />
          ) : undefined,
          where: held.venueId !== null ? <PlacePicker value={held.venueId} options={places} onChange={held.setVenueId} /> : undefined,
          tags: held.tagIds !== null ? <NamesPicker label="Tags" value={held.tagIds} options={tags} onChange={held.setTagIds} /> : undefined,
          has:
            held.featureIds !== null ? (
              <NamesPicker label="Features" value={held.featureIds} options={features} onChange={held.setFeatureIds} />
            ) : undefined,
          picture: held.picture !== null ? <PictureInput value={held.picture} onChange={held.setPicture} /> : undefined,
        }}
        actions={{ when: whenAction, where: whereAction, tags: tagsAction, has: hasAction, picture: pictureAction }}
      />
      <DecisionActions
        actions={actions}
        note={
          <>
            {readinessNote(event).map((line) => (
              <p key={line}>{line}</p>
            ))}
            {held.count > 0 && (
              <p className="font-medium text-basalt" role="status">
                {held.count} unsaved {held.count === 1 ? "change" : "changes"}
                {problem ? `. ${problem}` : ""}
              </p>
            )}
          </>
        }
      />
    </article>
  );
}
