"use client";

import * as React from "react";
import { AdminButton, AdminLinkButton } from "@/components/admin/kit/button";
import type { PublicDecisionData } from "@/lib/admin/inbox/types";
import { ApplicationNotes, useNotesDraft } from "./application-notes";
import { consequenceNote, itemActions, type ItemAction } from "./item-actions";
import { ItemBody } from "./item-body";
import { useInboxAction } from "./use-inbox-action";

/**
 * One item from the public on its own page: everything about it, then its actions in one row (the
 * next step filled, the rest outline). Inside InboxDecisions, `u` or Ctrl+Z undoes the last
 * decision made here.
 */
export function ItemView({ item }: { item: PublicDecisionData }) {
  const { run, busy } = useInboxAction();
  const notes = useNotesDraft(item.kind === "application" ? item.notes : null);
  const actions = itemActions(item, undefined, { notes: notes.pending });
  const list = [actions.primary, actions.reject, ...actions.more].filter((a): a is ItemAction => !!a);
  const note = consequenceNote(item);

  return (
    <div className="space-y-6">
      <ItemBody
        item={item}
        notesField={
          item.kind === "application" ? (
            <ApplicationNotes applicationId={item.id} value={notes.value} onChange={notes.setValue} changed={notes.pending !== undefined} />
          ) : undefined
        }
      />
      {note && <p className="max-w-[72ch] text-sm text-ash">{note}</p>}
      {list.length > 0 && (
        <div role="group" aria-label="Actions" className="flex flex-wrap items-center gap-2 border-t border-seam pt-4">
          {list.map((action) =>
            action.href ? (
              <AdminLinkButton
                key={action.id}
                href={action.href}
                variant={action === actions.primary ? action.variant : "outline"}
                {...(action.external ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                {action.label}
              </AdminLinkButton>
            ) : (
              <AdminButton
                key={action.id}
                variant={action === actions.primary ? action.variant : action.variant === "danger-outline" ? "danger-outline" : "outline"}
                disabled={busy !== null}
                busy={busy === action.id}
                busyLabel={action.busyLabel}
                onClick={() => void run(action.id, action.run!, action.then)}
              >
                {action.label}
              </AdminButton>
            )
          )}
        </div>
      )}
    </div>
  );
}
