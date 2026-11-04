"use client";

import { UrlFilters } from "@/components/admin/rare/url-filters";
import { DEFAULT_HISTORY_FILTERS, WHAT_OPTIONS, WHEN_OPTIONS } from "@/app/admin/audit-log/history-shared";

/** Search plus What, Who and When, all kept in the URL. */
export function HistoryFilters({ people }: { people: { id: string; label: string }[] }) {
  return (
    <UrlFilters
      label="Filter history"
      search={{ label: "Search records or people", placeholder: "Search records or people" }}
      selects={[
        { name: "what", label: "What", options: WHAT_OPTIONS, emptyValue: DEFAULT_HISTORY_FILTERS.what },
        {
          name: "who",
          label: "Who",
          options: [
            { value: "anyone", label: "Anyone" },
            { value: "you", label: "You" },
            { value: "tokens", label: "API tokens" },
            ...people.map((p) => ({ value: p.id, label: p.label })),
          ],
          emptyValue: DEFAULT_HISTORY_FILTERS.who,
        },
        { name: "when", label: "When", options: WHEN_OPTIONS, emptyValue: DEFAULT_HISTORY_FILTERS.when },
      ]}
    />
  );
}
