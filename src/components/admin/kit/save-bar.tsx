"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatTimestamp, savedAgo } from "@/lib/admin/format";
import { AdminButton } from "./button";

/** "Saved 2 min ago", or the timestamp after 12 hours; null before hydration and without a time. */
export function useSavedText(savedAt: number | null): string | null {
  const [now, setNow] = React.useState(0);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  if (!savedAt || !now) return null;
  return savedAgo(savedAt, now) ?? `Saved ${formatTimestamp(new Date(savedAt))}`;
}

/** "Maintenance has unsaved changes. Leave without saving?", for a prompt that cannot save them all. */
export function unsavedQuestion(labels: readonly string[]): string {
  const names = labels.length <= 2 ? labels.join(" and ") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${names} ${labels.length === 1 ? "has" : "have"} unsaved changes. Leave without saving?`;
}

/** "1 unsaved change", "3 unsaved changes". */
export function unsavedText(count: number): string {
  return `${count} unsaved ${count === 1 ? "change" : "changes"}`;
}

export type LeavePromptProps = {
  onStay: () => void;
  onDiscard: () => void;
  /** Saves, then leaves. Without it the prompt offers only Stay and Discard. */
  onSave?: () => void;
  saving?: boolean;
  saveLabel?: string;
  busyLabel?: string;
  /** publish when saving puts the record on the site. */
  saveVariant?: "ink" | "publish";
  question?: string;
  className?: string;
};

/**
 * The question a form asks inline before leaving with unsaved changes: Stay, Discard and Save.
 * Focus moves to Save (or Stay) when it appears.
 */
export function LeavePrompt({
  onStay,
  onDiscard,
  onSave,
  saving = false,
  saveLabel = "Save",
  busyLabel = "Saving",
  saveVariant = "ink",
  question = "Save changes before leaving?",
  className,
}: LeavePromptProps) {
  const first = React.useRef<HTMLButtonElement>(null);
  const stay = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    (first.current ?? stay.current)?.focus();
  }, []);
  return (
    <div role="group" aria-label={question} className={cn("flex flex-wrap items-center gap-2", className)}>
      <p className="mr-auto text-sm font-medium text-basalt">{question}</p>
      <AdminButton ref={stay} variant="quiet" onClick={onStay} disabled={saving} className="pointer-coarse:h-11">
        Stay
      </AdminButton>
      <AdminButton variant="outline" onClick={onDiscard} disabled={saving} className="pointer-coarse:h-11">
        Discard
      </AdminButton>
      {onSave && (
        <AdminButton ref={first} variant={saveVariant} onClick={onSave} busy={saving} busyLabel={busyLabel}>
          {saveLabel}
        </AdminButton>
      )}
    </div>
  );
}

/**
 * The action bar under a record page: what is unsaved, or when it was saved, then the page's
 * actions, with Cancel and Save last. With `leave`, it asks whether to save before leaving
 * instead. A grid row under the pane in pane mode, stuck to the bottom in page mode. Key hints
 * show from 1024 up.
 */
export function SaveBar({
  state,
  dirty = false,
  error,
  leave,
  label = "Save",
  className,
  children,
  ...rest
}: {
  state: React.ReactNode;
  dirty?: boolean;
  error?: React.ReactNode;
  leave?: LeavePromptProps | null;
  label?: string;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  return (
    <div role="region" aria-label={label} className={cn("sm-sticky-bottom border-t border-seam bg-sheet", className)} {...rest}>
      <div className="mx-auto flex min-h-14 w-full max-w-[1232px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 md:px-6 [&_kbd]:hidden lg:[&_kbd]:inline-flex">
        {leave ? (
          <LeavePrompt {...leave} className="w-full" />
        ) : (
          <>
            <div className="mr-auto min-w-0 text-sm tabular-nums" aria-live="polite">
              {error ? (
                <p className="text-ponderosa">{error}</p>
              ) : (
                <p className={dirty ? "font-medium text-basalt" : "text-ash"}>{state}</p>
              )}
            </div>
            {children}
          </>
        )}
      </div>
    </div>
  );
}
