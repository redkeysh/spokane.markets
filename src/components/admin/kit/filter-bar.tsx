"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminButtonClass } from "./button";
import { useShortcuts } from "./use-shortcuts";

/**
 * One row of filters that wraps as one group. "Clear filters" appears only while a filter is on.
 * Every filter should live in the URL so it survives saving a record.
 */
export function FilterBar({
  children,
  active = false,
  clearHref,
  onClear,
  label = "Filters",
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  clearHref?: string;
  onClear?: () => void;
  label?: string;
  className?: string;
}) {
  const clear = adminButtonClass({ variant: "quiet", size: "sm" });
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}>
      {children}
      {active && clearHref && (
        <Link href={clearHref} className={clear}>
          Clear filters
        </Link>
      )}
      {active && !clearHref && onClear && (
        <button type="button" className={clear} onClick={onClear}>
          Clear filters
        </button>
      )}
    </div>
  );
}

/**
 * The search field of a list. The placeholder names what it covers ("Search title, place, market
 * or city"); `f` focuses it.
 */
export const FilterSearch = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: string; focusKey?: boolean }
>(function FilterSearch({ label, focusKey = true, className, ...props }, forwardedRef) {
  const inner = React.useRef<HTMLInputElement | null>(null);
  useShortcuts(
    {
      f: () => {
        inner.current?.focus();
        inner.current?.select();
      },
    },
    { enabled: focusKey }
  );
  return (
    <div className={cn("relative w-full sm:w-[300px]", className)}>
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ash"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <input
        ref={(node) => {
          inner.current = node;
          if (typeof forwardedRef === "function") forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        type="search"
        aria-label={label}
        aria-keyshortcuts={focusKey ? "f" : undefined}
        className="h-[30px] w-full rounded-md border border-seam-strong bg-sheet pr-2 pl-8 font-text text-sm text-basalt pointer-coarse:h-11 pointer-coarse:text-base"
        {...props}
      />
    </div>
  );
});

/** A labeled native select, 30 px tall: "When [Upcoming]". */
export function FilterSelect({
  label,
  options,
  className,
  ...props
}: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const id = React.useId();
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <label htmlFor={props.id ?? id} className="font-text text-sm text-ash">
        {label}
      </label>
      <select
        id={props.id ?? id}
        className="h-[30px] rounded-md border border-seam-strong bg-sheet px-2 font-text text-sm text-basalt pointer-coarse:h-11 pointer-coarse:text-base"
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** The second row of toggles: "Needs [Picture] [Daily hours] ...". */
export function FilterChipRow({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      <span aria-hidden="true" className="font-text text-sm text-ash">
        {label}
      </span>
      {children}
    </div>
  );
}
