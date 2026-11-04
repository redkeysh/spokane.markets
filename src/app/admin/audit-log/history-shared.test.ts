import { describe, expect, it } from "vitest";
import {
  DEFAULT_HISTORY_FILTERS,
  emptyHistoryMessage,
  historyFiltersActive,
  historyQueryString,
  parseHistoryFilters,
  recordList,
  splitAround,
} from "./history-shared";

describe("parseHistoryFilters", () => {
  it("falls back to the last 30 days of anything by anyone", () => {
    expect(parseHistoryFilters({})).toEqual(DEFAULT_HISTORY_FILTERS);
  });

  it("keeps known values and drops unknown ones", () => {
    expect(parseHistoryFilters({ q: "  bridal ", what: "publishing", who: "tokens", when: "7" })).toEqual({
      q: "bridal",
      what: "publishing",
      who: "tokens",
      when: "7",
    });
    expect(parseHistoryFilters({ what: "DROP TABLE", when: "365", who: "a b;c" })).toEqual(DEFAULT_HISTORY_FILTERS);
  });

  it("takes the first of repeated parameters and caps the search", () => {
    const filters = parseHistoryFilters({ what: ["merging", "settings"], q: "x".repeat(300) });
    expect(filters.what).toBe("merging");
    expect(filters.q).toHaveLength(120);
  });
});

describe("historyQueryString", () => {
  it("writes only what differs from the defaults", () => {
    expect(historyQueryString(DEFAULT_HISTORY_FILTERS)).toBe("");
    expect(historyQueryString({ ...DEFAULT_HISTORY_FILTERS, what: "rejecting", q: "rebel junk" })).toBe(
      "q=rebel+junk&what=rejecting"
    );
  });

  it("round-trips through parseHistoryFilters", () => {
    const filters = { q: "kendall", what: "editing" as const, who: "you", when: "all" as const };
    const parsed = parseHistoryFilters(Object.fromEntries(new URLSearchParams(historyQueryString(filters))));
    expect(parsed).toEqual(filters);
  });

  it("says whether a filter is on", () => {
    expect(historyFiltersActive(DEFAULT_HISTORY_FILTERS)).toBe(false);
    expect(historyFiltersActive({ ...DEFAULT_HISTORY_FILTERS, when: "today" })).toBe(true);
  });
});

describe("recordList", () => {
  const r = (title: string, href: string | null = null) => ({ title, href });

  it("shows two and counts the rest, without duplicates", () => {
    expect(recordList([r("A", "/a"), r("B"), r("A", "/a"), r("C"), r("D")])).toEqual({
      shown: [r("A", "/a"), r("B")],
      more: 2,
    });
  });

  it("shows everything when it fits", () => {
    expect(recordList([r("A")])).toEqual({ shown: [r("A")], more: 0 });
  });
});

describe("splitAround", () => {
  it("splits at the first mention of the title", () => {
    expect(splitAround("You published Emerge Holiday Market.", "Emerge Holiday Market")).toEqual(["You published ", "."]);
  });

  it("returns null when the title is not in the sentence", () => {
    expect(splitAround("You changed a record.", "Emerge")).toBeNull();
    expect(splitAround("You changed a record.", "")).toBeNull();
  });
});

describe("emptyHistoryMessage", () => {
  it("names the span when nothing else is filtered", () => {
    expect(emptyHistoryMessage(DEFAULT_HISTORY_FILTERS, null)).toBe("Nothing changed in the last 30 days.");
    expect(emptyHistoryMessage({ ...DEFAULT_HISTORY_FILTERS, when: "today" }, null)).toBe("Nothing changed today.");
    expect(emptyHistoryMessage({ ...DEFAULT_HISTORY_FILTERS, when: "all" }, null)).toBe("Nothing has changed yet.");
  });

  it("names the kind of change and who", () => {
    expect(emptyHistoryMessage({ ...DEFAULT_HISTORY_FILTERS, what: "merging", who: "tokens" }, "API tokens")).toBe(
      "No merging places by API tokens in the last 30 days."
    );
    expect(emptyHistoryMessage({ ...DEFAULT_HISTORY_FILTERS, who: "u1", when: "all" }, "Dana")).toBe(
      "Nothing changed by Dana so far."
    );
  });

  it("quotes the search", () => {
    expect(emptyHistoryMessage({ ...DEFAULT_HISTORY_FILTERS, q: "bridal", what: "publishing" }, null)).toBe(
      'Nothing in publishing in the last 30 days matches "bridal".'
    );
  });
});
