"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/admin/kit/filter-bar";
import { Segmented } from "@/components/admin/kit/segmented";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { VENDOR_SHOWS, VENDOR_SHOW_LABELS, vendorCountSentence, vendorListHref, type VendorShow } from "@/lib/vendors/admin-list";

const SEARCH_DELAY_MS = 300;

/**
 * Search and the Show scope, both kept in the URL. Typing searches after a short pause; each new
 * result count is announced.
 */
export function VendorFilters({ q, show, total }: { q: string; show: VendorShow; total: number }) {
  const router = useRouter();
  const announce = useAnnounce();
  const [text, setText] = React.useState(q);
  const timer = React.useRef<number | undefined>(undefined);
  const [seenQ, setSeenQ] = React.useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setText(q);
  }

  const lastAnnounced = React.useRef(`${q}|${show}|${total}`);
  React.useEffect(() => {
    const key = `${q}|${show}|${total}`;
    if (key === lastAnnounced.current) return;
    lastAnnounced.current = key;
    announce(vendorCountSentence(total, { q, show }));
  }, [q, show, total, announce]);

  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const go = (nextQ: string) => {
    window.clearTimeout(timer.current);
    router.replace(vendorListHref({ q: nextQ.trim(), show }), { scroll: false });
  };

  return (
    <FilterBar label="Filter vendors" active={Boolean(q) || show !== "all"} clearHref="/admin/vendors">
      <form
        role="search"
        className="w-full sm:w-auto"
        onSubmit={(e) => {
          e.preventDefault();
          go(text);
        }}
      >
        <FilterSearch
          label="Search vendors"
          placeholder="Search business, specialty or owner"
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => go(next), SEARCH_DELAY_MS);
          }}
        />
      </form>
      <div className="hidden items-center gap-2 md:flex">
        <span aria-hidden="true" className="text-sm text-ash">
          Show
        </span>
        <Segmented
          label="Show"
          value={show}
          options={VENDOR_SHOWS.map((value) => ({
            value,
            label: VENDOR_SHOW_LABELS[value],
            href: vendorListHref({ q, show: value }),
          }))}
        />
      </div>
      <FilterSelect
        label="Show"
        className="md:hidden"
        value={show}
        options={VENDOR_SHOWS.map((value) => ({ value, label: VENDOR_SHOW_LABELS[value] }))}
        onChange={(e) => router.replace(vendorListHref({ q, show: e.target.value as VendorShow }), { scroll: false })}
      />
    </FilterBar>
  );
}
