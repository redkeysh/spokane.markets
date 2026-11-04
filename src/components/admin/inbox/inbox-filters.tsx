"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/admin/kit/filter-bar";
import { Segmented } from "@/components/admin/kit/segmented";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { INBOX_VIEW_LABELS, VIEW_STATUSES, inboxHref, statusLabel, type InboxParams } from "@/lib/admin/inbox/model";

const SEARCH_DELAY_MS = 300;

const PLACEHOLDERS: Record<InboxParams["view"], string> = {
  all: "Search names, titles and text",
  submissions: "Search title, sender or place",
  reviews: "Search text, author, event or market",
  photos: "Search sender, caption or listing",
  reports: "Search reason and notes",
  applications: "Search name, email or form",
  messages: "Search name, email, subject or text",
  surveys: "Search answers and contacts",
};

/**
 * Search and the Show choice of the view (Waiting, a decided status, Everything), both kept in
 * the URL. Typing searches after a short pause; each new result sentence is announced.
 */
export function InboxFilters({ params, resultSentence }: { params: InboxParams; resultSentence: string }) {
  const router = useRouter();
  const announce = useAnnounce();
  const [text, setText] = React.useState(params.q);
  const timer = React.useRef<number | undefined>(undefined);
  const [seenQ, setSeenQ] = React.useState(params.q);
  if (seenQ !== params.q) {
    setSeenQ(params.q);
    setText(params.q);
  }

  const lastAnnounced = React.useRef(resultSentence);
  React.useEffect(() => {
    if (resultSentence === lastAnnounced.current) return;
    lastAnnounced.current = resultSentence;
    announce(resultSentence);
  }, [resultSentence, announce]);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const base = { view: params.view, status: params.status, q: params.q, user: params.user };
  const go = (q: string) => {
    window.clearTimeout(timer.current);
    router.replace(inboxHref({ ...base, q: q.trim() }), { scroll: false });
  };
  const statuses = VIEW_STATUSES[params.view];
  const active = Boolean(params.q) || params.status !== "all" || Boolean(params.user);

  return (
    <FilterBar label={`Filter ${INBOX_VIEW_LABELS[params.view].toLowerCase()}`} active={active} clearHref={inboxHref({ view: params.view })}>
      <form
        role="search"
        className="w-full sm:w-auto"
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
      >
        <FilterSearch
          label={`Search ${INBOX_VIEW_LABELS[params.view].toLowerCase()}`}
          placeholder={PLACEHOLDERS[params.view]}
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => go(next), SEARCH_DELAY_MS);
          }}
        />
      </form>
      {statuses.length > 1 && (
        <>
          <div className="hidden items-center gap-2 md:flex">
            <span aria-hidden="true" className="text-sm text-ash">
              Show
            </span>
            <Segmented
              label="Show"
              value={params.status}
              options={statuses.map((status) => ({
                value: status,
                label: statusLabel(params.view, status),
                href: inboxHref({ ...base, status }),
              }))}
            />
          </div>
          <FilterSelect
            label="Show"
            className="md:hidden"
            value={params.status}
            options={statuses.map((status) => ({ value: status, label: statusLabel(params.view, status) }))}
            onChange={(e) => router.replace(inboxHref({ ...base, status: e.target.value as InboxParams["status"] }), { scroll: false })}
          />
        </>
      )}
    </FilterBar>
  );
}
