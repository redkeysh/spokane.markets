"use client";

import * as React from "react";
import { searchAdminAction } from "@/app/admin/_actions/search";
import type { JumpResults } from "@/lib/admin/search";
import { createLatestSearch, type SearchOutcome } from "./latest-search";
import { JUMP_MIN_QUERY, jumpQuery } from "./results";

const DEBOUNCE_MS = 180;

export type JumpSearch = {
  /** The normalized query, or "" below the minimum length. */
  query: string;
  /** Results for the query, or the previous query's while the new ones are on their way. */
  results: JumpResults | null;
  /** True until results for the query have arrived. */
  loading: boolean;
  /** True when the search for the query failed. */
  failed: boolean;
  /** True while `results` belong to an earlier query; they are shown but cannot be chosen. */
  stale: boolean;
};

/** Entity search for Jump: debounced, one request at a time, newest query only. */
export function useJumpSearch(rawQuery: string): JumpSearch {
  const normalized = jumpQuery(rawQuery);
  const query = normalized.length >= JUMP_MIN_QUERY ? normalized : "";
  const [outcome, setOutcome] = React.useState<SearchOutcome<JumpResults> | null>(null);
  const [search] = React.useState(() => createLatestSearch((q) => searchAdminAction(q), setOutcome, DEBOUNCE_MS));

  if (!query && outcome !== null) setOutcome(null);

  React.useEffect(() => {
    search.request(query || null);
  }, [search, query]);

  React.useEffect(() => () => search.request(null), [search]);

  if (!query) return { query, results: null, loading: false, failed: false, stale: false };
  const cached = search.cached(query);
  if (cached) return { query, results: cached, loading: false, failed: false, stale: false };
  const current = outcome?.query === query ? outcome : null;
  const results = outcome?.ok ? outcome.results : null;
  const loading = current === null;
  return {
    query,
    results,
    loading,
    failed: current !== null && !current.ok,
    stale: loading && results !== null,
  };
}
