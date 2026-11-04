import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLatestSearch, type SearchOutcome } from "./latest-search";

type Deferred = { query: string; resolve: (value: string) => void; reject: (error: Error) => void };

function setup(delay = 100) {
  const calls: Deferred[] = [];
  const outcomes: SearchOutcome<string>[] = [];
  const run = vi.fn(
    (query: string) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ query, resolve, reject });
      })
  );
  const search = createLatestSearch(run, (o) => outcomes.push(o), delay);
  return { search, run, calls, outcomes };
}

const flush = () => Promise.resolve().then(() => undefined);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createLatestSearch", () => {
  it("waits out the debounce and sends only the last query typed", async () => {
    const { search, run, calls, outcomes } = setup();
    search.request("ke");
    vi.advanceTimersByTime(50);
    search.request("ken");
    vi.advanceTimersByTime(50);
    search.request("kend");
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("kend");

    calls[0].resolve("results for kend");
    await flush();
    expect(outcomes).toEqual([{ query: "kend", ok: true, results: "results for kend" }]);
  });

  it("holds newer queries while one runs, drops the stale answer and skips the ones in between", async () => {
    const { search, run, calls, outcomes } = setup();
    search.request("ke");
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledWith("ke");

    search.request("ken");
    vi.advanceTimersByTime(100);
    search.request("kend");
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(1);

    calls[0].resolve("results for ke");
    await flush();
    expect(outcomes).toEqual([]);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith("kend");

    calls[1].resolve("results for kend");
    await flush();
    expect(outcomes).toEqual([{ query: "kend", ok: true, results: "results for kend" }]);
  });

  it("does not start the next query before its own debounce ends", async () => {
    const { search, run, calls } = setup();
    search.request("ke");
    vi.advanceTimersByTime(100);
    search.request("ken");
    calls[0].resolve("results for ke");
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith("ken");
  });

  it("cancels what has not been sent", () => {
    const { search, run } = setup();
    search.request("ke");
    search.request(null);
    vi.advanceTimersByTime(500);
    expect(run).not.toHaveBeenCalled();
  });

  it("answers a query it has already seen from memory", async () => {
    const { search, run, calls, outcomes } = setup();
    search.request("ke");
    vi.advanceTimersByTime(100);
    calls[0].resolve("results for ke");
    await flush();

    search.request("ken");
    search.request("ke");
    expect(search.cached("ke")).toBe("results for ke");
    expect(outcomes.at(-1)).toEqual({ query: "ke", ok: true, results: "results for ke" });
    vi.advanceTimersByTime(500);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("reports a failed search for the current query", async () => {
    const { search, calls, outcomes } = setup();
    search.request("ke");
    vi.advanceTimersByTime(100);
    calls[0].reject(new Error("Unauthorized"));
    await flush();
    expect(outcomes).toEqual([{ query: "ke", ok: false }]);
    expect(search.cached("ke")).toBeUndefined();
  });

  it("drops the answer to a query cancelled while it ran", async () => {
    const { search, run, calls, outcomes } = setup();
    search.request("ke");
    vi.advanceTimersByTime(100);
    search.request(null);
    calls[0].resolve("results for ke");
    await flush();
    vi.advanceTimersByTime(500);
    expect(outcomes).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(search.cached("ke")).toBe("results for ke");
  });
});
