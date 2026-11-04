"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { KeyHint } from "@/components/admin/kit/key-hint";
import { EditorTextarea } from "./controls";
import { REJECT_REASONS } from "./model";

const OTHER = "other";

/**
 * The five reasons (1 to 5; Other asks for a note). Enter confirms. Says who will be told, because
 * a notification cannot be unsent.
 */
export function RejectDialog({
  open,
  onOpenChange,
  title,
  tells,
  busy,
  onReject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** First names of the people the rejection tells. */
  tells: string[];
  busy: boolean;
  onReject: (reason: string) => void;
}) {
  const [choice, setChoice] = React.useState<string>(REJECT_REASONS[0]);
  const [note, setNote] = React.useState("");
  const name = React.useId();
  const reason = choice === OTHER ? note.trim() : choice;
  const confirm = () => {
    if (reason && !busy) onReject(reason);
  };
  const choices = [...REJECT_REASONS, OTHER];
  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Reject ${title}?`}
      description={
        tells.length > 0
          ? `${tells.join(" and ")} will be told it was rejected. The reason stays in your notes.`
          : "Nobody is told. The reason is added to your notes."
      }
      footer={
        <>
          <AdminButton variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton variant="danger" onClick={confirm} disabled={!reason} busy={busy} busyLabel="Rejecting">
            {tells.length > 0 ? `Reject and tell ${tells[0]}` : "Reject"}
          </AdminButton>
        </>
      }
    >
      <fieldset
        onKeyDown={(e) => {
          const index = Number(e.key) - 1;
          if (!e.altKey && !e.ctrlKey && !e.metaKey && index >= 0 && index < choices.length && (e.target as HTMLElement).tagName !== "TEXTAREA") {
            e.preventDefault();
            setChoice(choices[index]);
            e.currentTarget.querySelectorAll<HTMLInputElement>('input[type="radio"]')[index]?.focus();
          } else if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
            e.preventDefault();
            confirm();
          }
        }}
      >
        <legend className="sr-only">Why it is rejected</legend>
        <div className="space-y-1">
          {choices.map((c, i) => (
            <label key={c} className="flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2 text-sm text-basalt hover:bg-hover has-[:checked]:bg-lilac-tint">
              <input
                type="radio"
                name={name}
                value={c}
                checked={choice === c}
                data-autofocus={i === 0 ? true : undefined}
                onChange={() => setChoice(c)}
                className="size-4 accent-[var(--sm-basalt)]"
              />
              <span className="flex-1">{c === OTHER ? "Other, with a note" : c}</span>
              <KeyHint keys={String(i + 1)} />
            </label>
          ))}
        </div>
        {choice === OTHER && (
          <div className="mt-3">
            <label htmlFor="ed-reject-note" className="block text-sm font-medium text-basalt">
              Note
            </label>
            <EditorTextarea id="ed-reject-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="mt-1.5 min-h-20" />
          </div>
        )}
      </fieldset>
    </AdminDialog>
  );
}
