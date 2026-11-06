"use client";

import * as React from "react";
import Link from "next/link";
import { Empty } from "@/components/admin/kit/empty";
import { getPublicDecisionData } from "@/app/admin/_actions/inbox";
import { ApplicationNotes, useNotesDraft } from "@/components/admin/inbox/application-notes";
import { consequenceNote, itemActions, type ItemAction } from "@/components/admin/inbox/item-actions";
import { ItemBody } from "@/components/admin/inbox/item-body";
import { PublicStatus } from "@/components/admin/inbox/item-parts";
import type { NotesDirty } from "@/components/admin/inbox/report-triage";
import { useInboxAction } from "@/components/admin/inbox/use-inbox-action";
import { inboxHref, ROW_VIEW } from "@/lib/admin/inbox/model";
import type { PublicDecisionData } from "@/lib/admin/inbox/types";
import { DecisionActions, DecisionHeader, useStandardActions, type ActionSpec } from "../decision-parts";
import { editorHref } from "../decision-model";
import type { DecisionPaneProps } from "../kind-registry";
import { useDecisionKeys, useTodo } from "../todo-context";

type Loaded = { key: string; data: PublicDecisionData | null };

/** Where the pane's links go for the rest of its kind: Markets for a verification, else From the public. */
function browseLink(rowType: string | undefined): { href: string; label: string; open: string } {
  if (rowType === "market") return { href: "/admin/markets", label: "Every market", open: "Open Markets" };
  const view = ROW_VIEW[rowType ?? ""];
  return { href: view ? inboxHref({ view }) : inboxHref(), label: "Everything from the public", open: "Open From the public" };
}

/**
 * A review, photo, report, application, contact message or market verification from the public.
 * The item is read when the decision opens and again after triage or notes are saved. P and X run
 * the item's main actions (Approve or Show, Reject or Dismiss, Mark read or Archive, Verify); any
 * action that changes the item settles the decision. The toast offers Undo and `u` undoes it
 * through the To do frame. E opens the item on its own in From the public (a market in Markets).
 * A market application that is already approved shows "Create the market".
 */
export function PublicDecision({ decision, position }: DecisionPaneProps) {
  const api = useTodo();
  const { later } = useStandardActions(decision);
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);
  const [version, setVersion] = React.useState(0);
  const data = loaded?.key === decision.key ? loaded.data : undefined;
  const reload = React.useCallback(() => setVersion((v) => v + 1), []);
  const { run, busy } = useInboxAction();

  React.useEffect(() => {
    let live = true;
    const key = decision.key;
    getPublicDecisionData(key)
      .then((result) => {
        if (live) setLoaded({ key, data: result });
      })
      .catch((err) => {
        console.error("[todo] public item failed to load:", err);
        if (live) setLoaded({ key, data: null });
      });
    return () => {
      live = false;
    };
  }, [decision.key, version]);

  const notes = useNotesDraft(data?.kind === "application" ? data.notes : null);
  const actions = data ? itemActions(data, decision.key, { notes: notes.pending }) : null;
  const anyBusy = api.busy !== null || busy !== null;

  const perform = React.useCallback(
    async (action: ItemAction | null | undefined) => {
      if (!action?.run || busy || api.busy) return;
      const result = await run(action.id, action.run, action.then);
      if (!result) return;
      if (result.decisionId && result.undoable) api.rememberUndo(result.decisionId);
      if (result.changed.length > 0 && !action.then) api.settle(decision);
    },
    [api, busy, decision, run]
  );

  useDecisionKeys({
    p: () => void perform(actions?.primary),
    x: () => void perform(actions?.reject),
  });

  const setDirty = api.setDirty;
  const onDirty = React.useCallback((dirty: NotesDirty) => setDirty(dirty), [setDirty]);

  const rowType = decision.rows[0]?.type;
  const browse = browseLink(rowType);
  const createMarket = data?.kind === "application" && data.status === "APPROVED" ? data.createMarketHref : null;

  if (data === undefined) {
    return (
      <article aria-labelledby="todo-decision-title">
        <DecisionHeader title={decision.title} meta={position} context={decision.detail} />
        <p className="text-sm text-ash">Loading this decision.</p>
      </article>
    );
  }
  if (data === null || (data.status !== "PENDING" && !createMarket)) {
    return (
      <article aria-labelledby="todo-decision-title">
        <DecisionHeader title={decision.title} meta={position} />
        <Empty
          action={{ label: browse.open, href: browse.href }}
        >
          {data === null ? "This one is gone." : "This one was already answered."}
        </Empty>
      </article>
    );
  }

  const spec = (action: ItemAction): ActionSpec =>
    action.href
      ? { label: action.label, variant: action.variant, href: action.href }
      : {
          label: action.label,
          keys: action.keys,
          variant: action.variant,
          onClick: () => void perform(action),
          disabled: anyBusy,
          busy: busy === action.id,
          busyLabel: action.busyLabel,
        };

  const list: ActionSpec[] = [];
  if (actions?.primary) list.push(spec(actions.primary));
  if (actions?.reject) list.push(spec(actions.reject));
  for (const action of actions?.more ?? []) list.push(spec(action));
  if (editorHref(decision)) {
    list.push({
      label: rowType === "market" ? "Open the market" : "See it on its own",
      keys: "E",
      variant: "outline",
      onClick: () => api.openEditor(decision),
      disabled: anyBusy,
    });
  }
  if (later) list.push(later);

  return (
    <article aria-labelledby="todo-decision-title">
      <DecisionHeader
        title={decision.title}
        meta={
          <>
            <PublicStatus kind={data.kind} status={data.status} />
            <span>{position}</span>
          </>
        }
        context={decision.detail}
      />
      <ItemBody
        item={data}
        onNotesDirty={data.kind === "report" ? onDirty : undefined}
        onSaved={reload}
        notesField={
          data.kind === "application" ? (
            <ApplicationNotes
              applicationId={data.id}
              value={notes.value}
              onChange={notes.setValue}
              changed={notes.pending !== undefined}
              onDirty={onDirty}
              onSaved={reload}
            />
          ) : undefined
        }
      />
      <DecisionActions
        actions={list}
        note={
          <>
            {consequenceNote(data) && <p>{consequenceNote(data)}</p>}
            <p>
              <Link href={browse.href} className="rounded-sm text-lilac underline-offset-2 hover:underline">
                {browse.label}
              </Link>
            </p>
          </>
        }
      />
    </article>
  );
}
