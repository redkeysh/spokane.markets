"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { LeavePrompt } from "@/components/admin/kit/save-bar";
import { useLeavePrompt } from "@/components/admin/shell/leave-guard";
import { saveApplicationNotes } from "@/app/admin/_actions/inbox";
import type { NotesDirty } from "./report-triage";
import { useInboxAction } from "./use-inbox-action";

/**
 * The notes being written for an application: `value` as typed, reset to the saved notes whenever
 * those change, and `pending`, the text to send with the next decision (undefined while unchanged).
 */
export function useNotesDraft(saved: string | null | undefined) {
  const base = saved ?? "";
  const [value, setValue] = React.useState(base);
  const [seen, setSeen] = React.useState(base);
  if (seen !== base) {
    setSeen(base);
    setValue(base);
  }
  return { value, setValue, pending: value.trim() !== base ? value : undefined };
}

/**
 * The owner's notes on an application, sent with the next decision or saved on their own with
 * "Save notes". Unsaved notes hold leaving the page; with `onDirty` the frame around it asks
 * instead. `onSaved` runs after "Save notes".
 */
export function ApplicationNotes({
  applicationId,
  value,
  onChange,
  changed,
  onDirty,
  onSaved,
}: {
  applicationId: string;
  value: string;
  onChange: (value: string) => void;
  changed: boolean;
  onDirty?: (dirty: NotesDirty) => void;
  onSaved?: () => void;
}) {
  const id = React.useId();
  const { run, busy } = useInboxAction({ onDone: () => onSaved?.() });
  const save = React.useCallback(
    async () => changed && !!(await run("notes", () => saveApplicationNotes({ applicationId, notes: value }))),
    [applicationId, changed, run, value]
  );
  const { leaving, stay, go } = useLeavePrompt(changed && !onDirty);
  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  });
  React.useEffect(() => {
    onDirty?.(changed ? { count: 1, save: () => saveRef.current() } : null);
  }, [changed, onDirty]);
  React.useEffect(() => () => onDirty?.(null), [onDirty]);

  return (
    <div>
      <textarea
        aria-label="Your notes"
        aria-describedby={`${id}-help`}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-[72ch] rounded-md border border-seam-strong bg-sheet p-2 font-text text-sm text-basalt pointer-coarse:text-base"
      />
      <p id={`${id}-help`} className="mt-0.5 text-xs text-ash">
        Only admins see these. Deciding saves them too.
      </p>
      {leaving ? (
        <LeavePrompt
          className="mt-2"
          question="Save the notes before leaving?"
          onStay={stay}
          onDiscard={() => go(leaving)}
          onSave={() => void save().then((ok) => ok && go(leaving))}
          saving={busy === "notes"}
        />
      ) : (
        changed && (
          <AdminButton size="sm" className="mt-2" busy={busy === "notes"} busyLabel="Saving" disabled={busy !== null} onClick={() => void save()}>
            Save notes
          </AdminButton>
        )
      )}
    </div>
  );
}
