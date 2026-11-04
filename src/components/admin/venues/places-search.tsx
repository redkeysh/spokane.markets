"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FilterBar, FilterSearch } from "@/components/admin/kit/filter-bar";

/** The All places search, kept in the URL (`q`) so it survives opening a place and coming back. */
export function PlacesSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = React.useState(initial);

  React.useEffect(() => {
    const q = value.trim();
    if (q === (params.get("q") ?? "")) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (q) next.set("q", q);
      else next.delete("q");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [value, params, pathname, router]);

  return (
    <FilterBar active={!!value.trim()} onClear={() => setValue("")} label="Find a place">
      <FilterSearch label="Search name, address, town or ZIP" placeholder="Search name, address, town or ZIP" value={value} onChange={(e) => setValue(e.target.value)} />
    </FilterBar>
  );
}
