"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { AdminButton, type AdminButtonVariant } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { KeyHint } from "@/components/admin/kit/key-hint";
import { isTypingTarget } from "@/components/admin/kit/use-shortcuts";
import { andList, REJECT_REASONS, tellLabel } from "./bulk-messages";

export type DialogEvent = { id: string; title: string; detail: string; tells: string | null };

/** Bulk dialogs list the titles when the action tells people or acts on more than 10 events. */
export const LIST_TITLES_ABOVE = 10;

export function shouldListTitles(events: DialogEvent[], tells: boolean): boolean {
  return tells || events.length > LIST_TITLES_ABOVE;
}

function TitleList({ events }: { events: DialogEvent[] }) {
  return (
    <ul className="divide-y divide-seam border-y border-seam">
      {events.map((e) => (
        <li key={e.id} className="py-2">
          <span className="block text-sm font-medium text-basalt">{e.title}</span>
          {e.detail && <span className="block text-xs text-ash tabular-nums">{e.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

function tellsOf(events: DialogEvent[]): string[] {
  return [...new Set(events.map((e) => e.tells).filter((t): t is string => !!t))];
}

/** "Nobody is told: none came from an organizer account with alerts on." or "Dana and Lee are told." */
export function toldLine(names: string[]): string {
  if (names.length === 0) return "Nobody is told: none came from an organizer account with alerts on.";
  return `${andList(names)} ${names.length === 1 ? "is" : "are"} told.`;
}

/** Confirms a bulk publish or archive, listing what it acts on. */
export function ConfirmBulkDialog({
  open,
  onOpenChange,
  title,
  events,
  confirmLabel,
  variant,
  busy,
  busyLabel,
  notifies,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  events: DialogEvent[];
  confirmLabel: string;
  variant: AdminButtonVariant;
  busy: boolean;
  busyLabel: string;
  /** Whether the action tells submitters (publish does, archive does not). */
  notifies: boolean;
  onConfirm: () => void;
}) {
  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="list"
      footer={
        <>
          <AdminButton variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton variant={variant} busy={busy} busyLabel={busyLabel} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </AdminButton>
        </>
      }
    >
      <TitleList events={events} />
      {notifies && <p className="mt-3 text-sm text-ash">{toldLine(tellsOf(events))}</p>}
    </AdminDialog>
  );
}

/**
 * One reason for every ticked event: 1 to 4 pick a fixed reason, 5 asks for a note; Enter
 * confirms. The reason is noted on each event; organizers with alerts on are told.
 */
export function RejectDialog({
  open,
  onOpenChange,
  events,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: DialogEvent[];
  busy: boolean;
  onConfirm: (reason: string) => void;
}) {
  const formId = React.useId();
  const [choice, setChoice] = React.useState(0);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const noteRef = React.useRef<HTMLTextAreaElement>(null);
  const radios = React.useRef<(HTMLInputElement | null)[]>([]);
  const tells = tellsOf(events);
  const count = events.length;

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChoice(0);
      setNote("");
      setError(null);
    }
  }

  const other = choice === REJECT_REASONS.length;
  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (other && !note.trim()) {
      setError("Write a short note for Other.");
      noteRef.current?.focus();
      return;
    }
    onConfirm(other ? note.trim() : REJECT_REASONS[choice]);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    const digit = /^Digit([1-5])$/.exec(event.code)?.[1];
    if (digit && !event.shiftKey) {
      event.preventDefault();
      const index = Number(digit) - 1;
      setChoice(index);
      radios.current[index]?.focus();
      if (index === REJECT_REASONS.length) window.setTimeout(() => noteRef.current?.focus(), 0);
      return;
    }
    if (event.key === "Enter" && (event.target as HTMLElement).matches("input[type=radio]")) {
      event.preventDefault();
      submit();
    }
  };

  const reasons = [...REJECT_REASONS, "Other"];
  const label = tellLabel(count === 1 ? "Reject" : `Reject ${count}`, tells);

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={count === 1 ? `Reject ${events[0]?.title ?? "this event"}?` : `Reject ${count} events?`}
      description="The reason is noted on each event. It stays in the admin and can be undone."
      size="list"
      footer={
        <>
          <AdminButton variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" form={formId} variant="danger" busy={busy} busyLabel="Rejecting">
            {label}
          </AdminButton>
        </>
      }
    >
      <form id={formId} onSubmit={submit} onKeyDown={onKeyDown}>
        <fieldset>
          <legend className="text-sm font-medium text-basalt">Why keep {count === 1 ? "it" : "them"} off the site?</legend>
          <div className="mt-2 space-y-1">
            {reasons.map((reason, i) => (
              <label
                key={reason}
                className={cn(
                  "flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-hover",
                  choice === i && "bg-lilac-tint"
                )}
              >
                <input
                  ref={(node) => {
                    radios.current[i] = node;
                  }}
                  type="radio"
                  name="reason"
                  value={reason}
                  checked={choice === i}
                  onChange={() => setChoice(i)}
                  data-autofocus={i === 0 ? true : undefined}
                  aria-keyshortcuts={String(i + 1)}
                  className="size-4 accent-basalt"
                />
                <KeyHint keys={String(i + 1)} />
                <span className="text-sm text-basalt">{reason}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {other && (
          <div className="mt-3">
            <label htmlFor={`${formId}-note`} className="block text-sm font-medium text-basalt">
              Note
            </label>
            <textarea
              id={`${formId}-note`}
              ref={noteRef}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setError(null);
              }}
              rows={2}
              maxLength={300}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${formId}-error` : undefined}
              className="mt-1.5 w-full rounded-md border border-seam-strong bg-sheet px-2 py-1.5 text-sm text-basalt pointer-coarse:text-base"
            />
            {error && (
              <p id={`${formId}-error`} className="mt-1 text-xs text-ponderosa">
                {error}
              </p>
            )}
          </div>
        )}
        {shouldListTitles(events, tells.length > 0) && (
          <div className="mt-4">
            <TitleList events={events} />
          </div>
        )}
        <p className="mt-3 text-sm text-ash">{toldLine(tells)}</p>
      </form>
    </AdminDialog>
  );
}

export type PickOption = { value: string; label: string; detail?: string };

/**
 * Picks one market, place or tag for every ticked event: a search field over a list of choices.
 * `none` adds a first choice that clears the value ("No market").
 */
export function PickDialog({
  open,
  onOpenChange,
  title,
  searchLabel,
  options,
  none,
  events,
  busy,
  busyLabel,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  searchLabel: string;
  options: PickOption[];
  none?: PickOption;
  events: DialogEvent[];
  busy: boolean;
  busyLabel: string;
  confirmLabel: (choice: PickOption | null) => string;
  onConfirm: (choice: PickOption) => void;
}) {
  const formId = React.useId();
  const [query, setQuery] = React.useState("");
  const [value, setValue] = React.useState<string | null>(null);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setValue(null);
    }
  }

  const needle = query.trim().toLowerCase();
  const all = none ? [none, ...options] : options;
  const shown = needle
    ? all.filter((o) => `${o.label} ${o.detail ?? ""}`.toLowerCase().includes(needle))
    : all;
  const choice = all.find((o) => o.value === value) ?? null;

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="list"
      footer={
        <>
          <AdminButton variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" form={formId} variant="ink" disabled={!choice} busy={busy} busyLabel={busyLabel}>
            {confirmLabel(choice)}
          </AdminButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          if (choice) onConfirm(choice);
        }}
      >
        <label htmlFor={`${formId}-search`} className="block text-sm font-medium text-basalt">
          {searchLabel}
        </label>
        <input
          id={`${formId}-search`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (shown.length === 1) setValue(shown[0].value);
            }
          }}
          data-autofocus
          autoComplete="off"
          className="mt-1.5 h-9 w-full rounded-md border border-seam-strong bg-sheet px-2 text-sm text-basalt pointer-coarse:h-11 pointer-coarse:text-base"
        />
        <fieldset className="mt-3">
          <legend className="sr-only">{title}</legend>
          <p className="sr-only" aria-live="polite">
            {shown.length} {shown.length === 1 ? "choice" : "choices"}
          </p>
          <div className="max-h-[40dvh] space-y-0.5 overflow-y-auto">
            {shown.length === 0 && <p className="py-2 text-sm text-ash">Nothing matches &lsquo;{query.trim()}&rsquo;.</p>}
            {shown.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2 py-1 hover:bg-hover",
                  value === option.value && "bg-lilac-tint"
                )}
              >
                <input
                  type="radio"
                  name="choice"
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => setValue(option.value)}
                  className="size-4 shrink-0 accent-basalt"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-basalt">{option.label}</span>
                  {option.detail && <span className="block text-xs text-ash">{option.detail}</span>}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {events.length > LIST_TITLES_ABOVE && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-lilac">The {events.length} events</summary>
            <div className="mt-2">
              <TitleList events={events} />
            </div>
          </details>
        )}
      </form>
    </AdminDialog>
  );
}
