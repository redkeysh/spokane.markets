"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { INBOX_TYPES, INBOX_VIEW_LABELS, inboxHref, type InboxView } from "@/lib/admin/inbox/model";
import type { InboxCounts } from "@/lib/admin/inbox/load";

const VIEWS: InboxView[] = ["all", ...INBOX_TYPES];

/** Waiting items of a view; the vendor survey has none. */
function waitingOf(view: InboxView, counts: InboxCounts): number | null {
  if (view === "surveys") return null;
  if (view === "all") return INBOX_TYPES.reduce((n, t) => n + counts[t].waiting, 0);
  return counts[view].waiting;
}

/** What a view's waiting items are called: messages are unread. */
const waitingWord = (view: InboxView) => (view === "messages" ? "unread" : "waiting");

function ViewLink({ view, current, counts }: { view: InboxView; current: InboxView; counts: InboxCounts }) {
  const selected = view === current;
  const waiting = waitingOf(view, counts);
  return (
    <Link
      href={inboxHref({ view })}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex min-h-9 items-center justify-between gap-3 rounded-md px-3 font-text text-sm transition-colors duration-[80ms]",
        selected ? "bg-sheet font-semibold text-basalt shadow-[inset_2px_0_0_var(--sm-lilac)]" : "text-ash hover:bg-hover hover:text-basalt"
      )}
    >
      <span>{INBOX_VIEW_LABELS[view]}</span>
      {waiting !== null && waiting > 0 && (
        <span className="text-xs font-medium text-honey-ink tabular-nums">
          {waiting}
          <span className="sr-only"> {waitingWord(view)}</span>
        </span>
      )}
    </Link>
  );
}

/** The 232 px list of views on wide screens, with each view's waiting count in honey. */
export function InboxViewsNav({ current, counts }: { current: InboxView; counts: InboxCounts }) {
  return (
    <nav aria-label="From the public views" className="flex flex-col gap-6">
      <p aria-hidden="true" className="px-3 font-display text-2xl/[30px] font-bold text-basalt">
        From the public
      </p>
      <ul className="flex flex-col gap-0.5">
        {VIEWS.map((view) => (
          <li key={view}>
            <ViewLink view={view} current={current} counts={counts} />
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-0.5">
        <li>
          <Link
            href="/admin/applications/forms"
            className="flex min-h-9 items-center rounded-md px-3 font-text text-sm text-ash transition-colors duration-[80ms] hover:bg-hover hover:text-basalt"
          >
            Application forms
          </Link>
        </li>
      </ul>
    </nav>
  );
}

/** The views as one select, above the list below 1280 px. */
export function InboxViewSelect({ current, counts, className }: { current: InboxView; counts: InboxCounts; className?: string }) {
  const router = useRouter();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <label htmlFor="inbox-view" className="font-text text-sm text-ash">
        Show items
      </label>
      <select
        id="inbox-view"
        value={current}
        onChange={(e) => router.push(inboxHref({ view: e.target.value as InboxView }))}
        className="h-[30px] min-w-[220px] rounded-md border border-seam-strong bg-sheet px-2 font-text text-sm text-basalt pointer-coarse:h-11 pointer-coarse:text-base"
      >
        {VIEWS.map((view) => {
          const waiting = waitingOf(view, counts);
          return (
            <option key={view} value={view}>
              {waiting ? `${INBOX_VIEW_LABELS[view]}, ${waiting} ${waitingWord(view)}` : INBOX_VIEW_LABELS[view]}
            </option>
          );
        })}
      </select>
    </div>
  );
}
