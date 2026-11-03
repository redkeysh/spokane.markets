import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVenueSuggestions, nextActiveIndex } from "./venue-typeahead";

const venue = { id: "v1", name: "Kendall Yards", address: "1335 W Summit Pkwy", city: "Spokane", state: "WA", zip: "99201" };

describe("nextActiveIndex", () => {
  it("moves within the list and stops at its ends", () => {
    expect(nextActiveIndex(-1, "ArrowDown", 3)).toBe(0);
    expect(nextActiveIndex(2, "ArrowDown", 3)).toBe(2);
    expect(nextActiveIndex(0, "ArrowUp", 3)).toBe(0);
    expect(nextActiveIndex(2, "ArrowUp", 3)).toBe(1);
  });

  it("selects nothing in an empty list", () => {
    expect(nextActiveIndex(-1, "ArrowUp", 0)).toBe(-1);
    expect(nextActiveIndex(4, "ArrowDown", 0)).toBe(-1);
  });

  it("pulls a stale index back inside a shorter list", () => {
    expect(nextActiveIndex(5, "ArrowDown", 2)).toBe(1);
  });
});

describe("fetchVenueSuggestions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the venues and encodes the query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ venues: [venue] })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchVenueSuggestions("fair & expo", new AbortController().signal)).resolves.toEqual([venue]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/venues/suggest?q=fair%20%26%20expo");
  });

  it("clears the results when the request fails or is rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429 })));
    await expect(fetchVenueSuggestions("expo", new AbortController().signal)).resolves.toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(fetchVenueSuggestions("expo", new AbortController().signal)).resolves.toEqual([]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ venues: "nope" }))));
    await expect(fetchVenueSuggestions("expo", new AbortController().signal)).resolves.toEqual([]);
  });

  it("returns null for a request aborted by a newer query", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      })
    );
    await expect(fetchVenueSuggestions("expo", controller.signal)).resolves.toBeNull();
  });
});
