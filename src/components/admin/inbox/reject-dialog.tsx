"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { REJECT_REASONS } from "@/lib/admin/reject-reasons";

const OTHER = "other";

/**
 * Asks for one reason before rejecting submissions: the four fixed reasons, or Other with a note.
 * The reason goes to each submission's review notes and the submitters with an account are told.
 */
export function RejectDialog({
  open,
  titles,
  busy,
  onClose,
  onReject,
}: {
  open: boolean;
  titles: string[];
  busy: boolean;
  onClose: () => void;
  onReject: (reason: string) => void;
}) {
  const id = React.useId();
  const [choice, setChoice] = React.useState<string>(REJECT_REASONS[0]);
  const [note, setNote] = React.useState("");
  const reason = choice === OTHER ? note.trim() : choice;
  const count = titles.length;

  return (
    <AdminDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="list"
      title={count === 1 ? `Reject ${titles[0]}?` : `Reject ${count} submissions?`}
      description="The reason is saved with each one. People who sent them with an account are told."
      footer={
        <>
          <AdminButton variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton variant="danger" disabled={!reason} busy={busy} busyLabel="Rejecting" onClick={() => onReject(reason)}>
            {count === 1 ? "Reject" : `Reject ${count}`}
          </AdminButton>
        </>
      }
    >
      {count > 1 && (
        <ul role="list" className="mb-4 max-h-40 overflow-y-auto border-y border-seam py-2 text-sm text-basalt">
          {titles.map((t, i) => (
            <li key={`${t}-${i}`}>{t}</li>
          ))}
        </ul>
      )}
      <fieldset>
        <legend className="text-sm font-medium text-basalt">Why</legend>
        <div className="mt-2 space-y-1">
          {[...REJECT_REASONS, OTHER].map((value, i) => (
            <label key={value} className="flex min-h-8 cursor-pointer items-center gap-2 text-sm text-basalt">
              <input
                type="radio"
                name={`${id}-reason`}
                value={value}
                checked={choice === value}
                onChange={() => setChoice(value)}
                data-autofocus={i === 0 ? true : undefined}
                className="size-4 accent-basalt"
              />
              {value === OTHER ? "Other" : value}
            </label>
          ))}
        </div>
      </fieldset>
      {choice === OTHER && (
        <div className="mt-3">
          <label htmlFor={`${id}-note`} className="block text-sm font-medium text-basalt">
            Reason
          </label>
          <textarea
            id={`${id}-note`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-seam-strong bg-sheet p-2 font-text text-sm text-basalt pointer-coarse:text-base"
          />
        </div>
      )}
    </AdminDialog>
  );
}
