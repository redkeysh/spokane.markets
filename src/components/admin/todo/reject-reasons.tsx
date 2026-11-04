"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { KeyHint } from "@/components/admin/kit/key-hint";
import { SingleKeysContext } from "@/components/admin/kit/use-shortcuts";
import { listAnd } from "./brief-model";
import { REJECT_REASONS, reasonText, type RejectReasonKey } from "./decision-model";
import type { RejectRequest } from "./todo-context";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** The dialog lists the titles when the reject notifies someone or covers more than 10 rows. */
function listsTitles(request: RejectRequest): boolean {
  return request.titles.length > 0 && (request.titles.length > 10 || request.notifies.length > 0);
}

function ReasonsForm({ request, onClose, formId }: { request: RejectRequest; onClose: () => void; formId: string }) {
  const singleKeys = React.useContext(SingleKeysContext);
  const [reason, setReason] = React.useState<RejectReasonKey>(request.defaultReason ?? "1");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const noteId = React.useId();
  const errorId = React.useId();
  const radios = React.useRef<Partial<Record<RejectReasonKey, HTMLInputElement | null>>>({});

  const submit = () => {
    const text = reasonText(reason, note);
    if (!text) {
      setError("Write a short note for Other.");
      document.getElementById(noteId)?.focus();
      return;
    }
    onClose();
    void request.run(text);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const inNote = target.tagName === "TEXTAREA";
    if (singleKeys && !inNote && !e.ctrlKey && !e.metaKey && !e.altKey && /^[1-5]$/.test(e.key)) {
      e.preventDefault();
      const key = e.key as RejectReasonKey;
      setReason(key);
      setError(null);
      radios.current[key]?.focus();
      return;
    }
    if (e.key === "Enter" && (!inNote || e.ctrlKey || e.metaKey) && target.tagName !== "BUTTON") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form
      id={formId}
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <fieldset>
        <legend className="sr-only">Reason</legend>
        {REJECT_REASONS.map((r) => (
          <label key={r.key} className="flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-hover">
            <input
              ref={(node) => {
                radios.current[r.key] = node;
              }}
              type="radio"
              name="reason"
              value={r.key}
              checked={reason === r.key}
              onChange={() => {
                setReason(r.key);
                setError(null);
              }}
              data-autofocus={reason === r.key ? true : undefined}
              className="size-4 accent-basalt"
            />
            {singleKeys && <KeyHint keys={r.key} />}
            <span className="text-sm text-basalt">{r.label}</span>
          </label>
        ))}
      </fieldset>
      {reason === "5" && (
        <div className="mt-2 px-2">
          <label htmlFor={noteId} className="mb-1.5 block text-sm font-medium text-basalt">
            Note
          </label>
          <textarea
            id={noteId}
            value={note}
            rows={3}
            onChange={(e) => {
              setNote(e.target.value);
              setError(null);
            }}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            className="w-full rounded-md border border-seam-strong bg-sheet px-3 py-2 text-sm text-basalt pointer-coarse:text-base"
          />
          {error && (
            <p id={errorId} className="mt-1 text-xs text-ponderosa">
              {error}
            </p>
          )}
        </div>
      )}
      {listsTitles(request) && (
        <ul role="list" className="mt-3 max-h-48 overflow-y-auto border-t border-seam">
          {request.titles.map((title, i) => (
            <li key={`${title}-${i}`} className="border-b border-seam py-1.5 text-sm text-basalt">
              {title}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm text-ash">
        {request.notifies.length
          ? `${listAnd(request.notifies.map(firstName))} ${request.notifies.length === 1 ? "is" : "are"} told it was rejected.`
          : "Nobody is notified."}
      </p>
    </form>
  );
}

function confirmLabel(request: RejectRequest): string {
  const tell = request.notifies.length
    ? request.notifies.length === 1
      ? ` and tell ${firstName(request.notifies[0])}`
      : ` and tell ${request.notifies.length} people`
    : "";
  return request.count > 1 ? `Reject ${request.count}${tell}` : `Reject${tell}`;
}

/**
 * X: keep it off the site. Five reasons (Other asks for a note), picked with 1 to 5 while single-key
 * shortcuts are on; Enter rejects. A batch takes one reason for all.
 */
export function RejectReasons({ request, onClose }: { request: RejectRequest | null; onClose: () => void }) {
  const formId = React.useId();
  const singleKeys = React.useContext(SingleKeysContext);
  const wide = !!request && listsTitles(request);
  return (
    <AdminDialog
      open={!!request}
      onOpenChange={(open) => !open && onClose()}
      size={wide ? "list" : "confirm"}
      title={request?.title ?? ""}
      description={singleKeys ? "Choose why. 1 to 5 picks a reason, Enter rejects." : "Choose why. Enter rejects."}
      footer={
        request && (
          <>
            <AdminButton variant="outline" onClick={onClose}>
              Cancel
            </AdminButton>
            <AdminButton variant="danger" type="submit" form={formId}>
              {confirmLabel(request)}
            </AdminButton>
          </>
        )
      }
    >
      {request && <ReasonsForm key={`${request.decision.key}:${request.count}`} request={request} onClose={onClose} formId={formId} />}
    </AdminDialog>
  );
}
