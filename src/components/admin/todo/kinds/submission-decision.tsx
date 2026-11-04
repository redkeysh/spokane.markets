"use client";

import * as React from "react";
import { checkSubmissionPlace } from "@/app/admin/_actions/todo";
import { AdminButton } from "@/components/admin/kit/button";
import { DecisionActions, DecisionHeader, useStandardActions, type ActionSpec } from "../decision-parts";
import { About, Field, FieldList, Links, Names, Picture } from "../event-preview";
import type { DecisionPaneProps } from "../kind-registry";
import { useDecisionKeys, useDirty, useTodo } from "../todo-context";
import type { TodoPlaceLine, TodoSubmission } from "../types";

type PlaceDraft = Partial<Record<"venueName" | "venueAddress" | "venueCity" | "venueState" | "venueZip", string>>;

const MISSING_FIELD: Record<string, { key: keyof PlaceDraft; label: string; width: string }> = {
  name: { key: "venueName", label: "Place name", width: "w-56" },
  street: { key: "venueAddress", label: "Street", width: "w-64" },
  city: { key: "venueCity", label: "City", width: "w-40" },
  state: { key: "venueState", label: "State", width: "w-20" },
  ZIP: { key: "venueZip", label: "ZIP", width: "w-28" },
};

const INPUT = "h-9 rounded-md border border-seam-strong bg-sheet px-3 text-sm text-basalt pointer-coarse:h-11 pointer-coarse:text-base";

/**
 * The place line the page loaded with, or, when that place matched no saved one, the line found
 * on the map once the decision opens.
 */
function useCheckedPlace(submission: TodoSubmission | undefined): TodoPlaceLine | undefined {
  const [checked, setChecked] = React.useState<{ key: string; place: TodoPlaceLine } | null>(null);
  const submissionId = submission?.id;
  const v = submission?.venue;
  const key = v ? [submissionId, v.name, v.address, v.city, v.state, v.zip].join("|") : "";
  const unchecked = submission?.place.outcome === "unknown";
  React.useEffect(() => {
    if (!submissionId || !unchecked) return;
    let live = true;
    checkSubmissionPlace({ submissionId })
      .then((place) => {
        if (live && place) setChecked({ key, place });
      })
      .catch((err) => console.error("[todo] place check failed:", err));
    return () => {
      live = false;
    };
  }, [key, submissionId, unchecked]);
  if (!submission) return undefined;
  return checked?.key === key ? checked.place : submission.place;
}

/** The place line from the server matcher, with the inline fix it offers. */
function PlaceLine({ place, draft, onDraft }: { place: TodoPlaceLine; draft: PlaceDraft; onDraft: (draft: PlaceDraft) => void }) {
  const id = React.useId();
  const usingNearest = !!place.nearest && draft.venueName === place.nearest.name;
  return (
    <div className="space-y-2">
      <p aria-live="polite">{usingNearest ? `Uses ${place.nearest!.name}, ${place.nearest!.address}.` : place.text}</p>
      {place.outcome === "incomplete" && place.missing && (
        <div className="flex flex-wrap gap-3">
          {place.missing.map((part) => {
            const field = MISSING_FIELD[part];
            if (!field) return null;
            return (
              <label key={part} htmlFor={`${id}-${field.key}`} className="flex flex-col gap-1 text-xs text-ash">
                {field.label}
                <input
                  id={`${id}-${field.key}`}
                  value={draft[field.key] ?? ""}
                  onChange={(e) => onDraft({ ...draft, [field.key]: e.target.value })}
                  className={`${INPUT} ${field.width}`}
                />
              </label>
            );
          })}
        </div>
      )}
      {place.outcome === "new" && place.nearest && (
        <AdminButton
          size="sm"
          onClick={() =>
            onDraft(usingNearest ? {} : { venueName: place.nearest!.name, venueAddress: place.nearest!.address })
          }
        >
          {usingNearest ? "Add the new place instead" : "Use that instead"}
        </AdminButton>
      )}
    </div>
  );
}

/**
 * A public submission waiting on a reply. P publishes it (creating the live event in one step)
 * and tells the submitter when they have an account; X rejects it with a reason they are told.
 */
export function SubmissionDecision({ decision, position }: DecisionPaneProps) {
  const api = useTodo();
  const { edit, later } = useStandardActions(decision);
  const submission = api.submissions[decision.rows[0]?.id ?? ""];
  const place = useCheckedPlace(submission);
  const [draft, setDraft] = React.useState<PlaceDraft>({});
  const filled = Object.fromEntries(Object.entries(draft).filter(([, v]) => v?.trim())) as Record<string, string>;
  const missingLeft =
    place?.outcome === "incomplete" ? (place.missing ?? []).filter((part) => !filled[MISSING_FIELD[part]?.key ?? ""]) : [];
  const blocked = place?.outcome === "archived" || place?.outcome === "unplaceable" || missingLeft.length > 0;
  const busy = api.busy === decision.key;
  const anyBusy = api.busy !== null;
  const dirty = Object.keys(filled).length;
  useDirty(dirty, async () => {
    if (!submission) return true;
    const ok = await api.saveSubmissionPlace(decision, submission.id, filled);
    if (ok) setDraft({});
    return ok;
  });

  const publish = () => {
    if (!submission) return;
    if (blocked) {
      api.announce(missingLeft.length ? `Can't publish yet: no ${missingLeft.join(", no ")}.` : (place?.text ?? ""));
      return;
    }
    void api.publishSubmission(decision, submission.id, dirty ? filled : undefined);
  };
  const reject = () => {
    if (!submission) return;
    api.openReject({
      decision,
      title: `Reject ${submission.title}?`,
      titles: [],
      count: 1,
      notifies: submission.notifies ? [submission.notifies] : [],
      run: (reason) => api.rejectSubmission(decision, submission.id, reason),
    });
  };
  useDecisionKeys({ p: publish, x: reject });

  if (!submission || !place) return <DecisionHeader title={decision.title} meta={position} context="This submission was already answered." />;

  const actions: ActionSpec[] = [
    { label: decision.primary.label, keys: "P", variant: "publish", onClick: publish, disabled: anyBusy || blocked, busy, busyLabel: "Publishing" },
    { label: "Reject", keys: "X", variant: "danger-outline", onClick: reject, disabled: anyBusy },
  ];
  if (edit) actions.push(edit);
  if (later) actions.push(later);

  const v = submission.venue;
  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader
        title={submission.title}
        meta={<span>Sent from the site</span>}
        context={`${submission.dateRange}, ${v.name}${v.city ? `, ${v.city}` : ""}`}
      />
      <p className="-mt-3 mb-5 text-sm text-ash">
        Sent by {submission.submitterName},{" "}
        <a href={`mailto:${submission.submitterEmail}`} className="text-lilac underline-offset-2 hover:underline">
          {submission.submitterEmail}
        </a>
        , <span className="tabular-nums">{submission.sentAt}</span>
      </p>
      <p className="sr-only">{position}</p>
      <FieldList>
        <Field label="When">
          <ul role="list" className="tabular-nums">
            {submission.when.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Field>
        <Field label="Place">
          <PlaceLine place={place} draft={draft} onDraft={setDraft} />
        </Field>
        <Field label="About">
          <About text={submission.description} />
        </Field>
        <Field label="Tags">
          <Names names={submission.tags} />
        </Field>
        <Field label="Has">
          <Names names={submission.features} />
        </Field>
        <Field label="Picture">
          <Picture url={submission.imageUrl} isPage={submission.pictureIsPage} />
        </Field>
        <Field label="Links">
          <Links links={submission.links} />
        </Field>
        {submission.notes?.trim() && (
          <Field label="Their note">
            <p className="whitespace-pre-line">{submission.notes}</p>
          </Field>
        )}
      </FieldList>
      <DecisionActions
        actions={actions}
        note={
          <p>
            {submission.notifies
              ? `Publishing or rejecting tells ${submission.notifies}.`
              : "They have no account, so nobody is notified."}
          </p>
        }
      />
    </article>
  );
}
