"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/admin/kit/filter-bar";

export type UrlSelect = {
  /** The query parameter, e.g. "role". */
  name: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** The value that means "no filter"; it is left out of the URL. */
  emptyValue?: string;
};

/**
 * A filter row whose every value lives in the URL: the search applies on Enter, each select as
 * soon as it changes, and any change goes back to the first page.
 */
export function UrlFilters({
  search,
  selects = [],
  label = "Filters",
}: {
  search?: { name?: string; label: string; placeholder: string };
  selects?: UrlSelect[];
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const searchName = search?.name ?? "q";
  const current = params.get(searchName) ?? "";
  const [text, setText] = React.useState(current);
  const [seen, setSeen] = React.useState(current);
  if (seen !== current) {
    setSeen(current);
    setText(current);
  }

  const push = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const active =
    current !== "" ||
    selects.some((s) => {
      const value = params.get(s.name);
      return value !== null && value !== "" && value !== (s.emptyValue ?? "");
    });

  return (
    <FilterBar
      label={label}
      active={active}
      onClear={() => {
        setText("");
        push(Object.fromEntries([[searchName, null], ...selects.map((s) => [s.name, null] as const)]));
      }}
    >
      {search && (
        <form
          role="search"
          className="w-full sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            push({ [searchName]: text.trim() || null });
          }}
        >
          <FilterSearch
            label={search.label}
            placeholder={search.placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </form>
      )}
      {selects.map((select) => (
        <FilterSelect
          key={select.name}
          label={select.label}
          options={select.options}
          value={params.get(select.name) ?? select.emptyValue ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            push({ [select.name]: value === (select.emptyValue ?? "") ? null : value });
          }}
        />
      ))}
    </FilterBar>
  );
}
