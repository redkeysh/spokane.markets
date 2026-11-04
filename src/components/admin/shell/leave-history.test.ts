import { describe, expect, it } from "vitest";
import { LeaveHistory, type HistoryHost } from "./leave-history";

const ORIGIN = "http://localhost:3000";

type Entry = { url: string; state: unknown; key: string };

/**
 * A tab's session history. Back queues a popstate, as browsers fire it later; `drain` delivers
 * them. `keys` turns the Navigation API on; `before` adds another site's page before the first one.
 */
function fakeTab(paths: string[], options: { keys: boolean; before?: boolean }) {
  let made = 0;
  const entry = (path: string, state: unknown = null): Entry => ({ url: new URL(path, ORIGIN).href, state, key: `k${made++}` });
  const list: Entry[] = paths.map((p) => entry(p, { __NA: true }));
  let index = list.length - 1;
  const popstates: number[] = [];
  const timers: (() => void)[] = [];
  const pushed: string[] = [];
  const offset = options.before ? 1 : 0;

  const host: HistoryHost = {
    history: {
      get state() {
        return list[index].state;
      },
      get length() {
        return list.length + offset;
      },
      pushState(state: unknown, _unused: string, url?: string | URL | null) {
        list.splice(index + 1);
        list.push(entry(String(url ?? list[index].url), state));
        index = list.length - 1;
        pushed.push(list[index].url);
      },
      back() {
        if (index === 0) return;
        index -= 1;
        popstates.push(index);
      },
    },
    location: {
      get href() {
        return list[index].url;
      },
      get pathname() {
        return new URL(list[index].url).pathname;
      },
    },
    navigation: options.keys
      ? {
          get currentEntry() {
            return { key: list[index].key, url: list[index].url, index };
          },
          entries: () => list.map((e, i) => ({ key: e.key, url: e.url, index: i })),
          traverseTo(key: string) {
            index = list.findIndex((e) => e.key === key);
            popstates.push(index);
          },
        }
      : undefined,
    setTimeout: (run) => timers.push(run),
  };

  return {
    host,
    pushed,
    get path() {
      const url = new URL(list[index].url);
      return `${url.pathname}${url.search}`;
    },
    /** What Next.js and the screens do to the current entry's state. */
    replaceState(state: unknown, path?: string) {
      list[index] = { ...list[index], state, url: path ? new URL(path, ORIGIN).href : list[index].url };
    },
    /** A router push, as a link or router.push makes it. */
    open(path: string) {
      list.splice(index + 1);
      list.push(entry(path, { __NA: true }));
      index = list.length - 1;
    },
    back() {
      host.history.back();
    },
    drain(history: LeaveHistory, ask: () => boolean, stuck?: () => void) {
      while (popstates.length) {
        popstates.shift();
        history.popped(ask, stuck);
      }
    },
    runTimers() {
      timers.splice(0).forEach((run) => run());
    },
  };
}

describe.each([
  { name: "with entry keys", keys: true },
  { name: "without entry keys", keys: false },
])("LeaveHistory $name", ({ keys }) => {
  it("keeps one copy when the entry's state is replaced between guards", () => {
    const tab = fakeTab(["/admin/events", "/admin/events/e1"], { keys });
    const history = new LeaveHistory(tab.host);
    history.hold();
    tab.replaceState({ __NA: true });
    history.hold();
    tab.replaceState(null);
    history.hold();
    expect(tab.pushed).toHaveLength(1);
  });

  it("keeps one copy when To do rewrites its address on the copy", () => {
    const tab = fakeTab(["/admin?d=a"], { keys });
    const history = new LeaveHistory(tab.host);
    history.hold();
    tab.replaceState(null, "/admin?d=b");
    history.hold();
    expect(tab.pushed).toHaveLength(1);
  });

  it("asks on Back from the copy and puts the copy back while it asks", () => {
    const tab = fakeTab(["/admin/events", "/admin/events/e1"], { keys });
    const history = new LeaveHistory(tab.host);
    history.hold();
    let asked = 0;
    tab.back();
    tab.drain(history, () => {
      asked += 1;
      return true;
    });
    expect(asked).toBe(1);
    expect(tab.path).toBe("/admin/events/e1");
    expect(tab.pushed).toHaveLength(2);
    history.hold();
    expect(tab.pushed).toHaveLength(2);
  });

  it("goes back past the page after Discard", () => {
    const tab = fakeTab(["/admin/events", "/admin/events/e1"], { keys });
    const history = new LeaveHistory(tab.host);
    history.hold();
    tab.back();
    tab.drain(history, () => true);
    history.backOut();
    tab.drain(history, () => true);
    expect(tab.path).toBe("/admin/events");
  });

  it("lets Back through when the guard does not hold it", () => {
    const tab = fakeTab(["/admin/markets", "/admin/markets/m1"], { keys });
    const history = new LeaveHistory(tab.host);
    history.hold();
    tab.back();
    tab.drain(history, () => false);
    expect(tab.path).toBe("/admin/markets");
  });

  it("opens the fallback after Discard when the page was the first in the tab", () => {
    const tab = fakeTab(["/admin/markets/m1"], { keys });
    const history = new LeaveHistory(tab.host);
    history.hold();
    tab.back();
    tab.drain(history, () => true);
    let fallback = 0;
    history.backOut(() => (fallback += 1));
    tab.drain(history, () => true);
    tab.runTimers();
    expect(fallback).toBe(1);
  });

  it("puts a new copy on top after a push to another page", () => {
    const tab = fakeTab(["/admin/events/e1"], { keys });
    const history = new LeaveHistory(tab.host);
    history.hold();
    tab.open("/admin/venues/v1");
    history.hold();
    expect(tab.pushed).toHaveLength(2);
  });
});

describe("LeaveHistory backOut with entry keys", () => {
  it("goes straight to the page before the copies", () => {
    const tab = fakeTab(["/admin", "/admin/events/e1"], { keys: true });
    const history = new LeaveHistory(tab.host);
    history.hold();
    history.backOut();
    expect(tab.path).toBe("/admin");
  });

  it("steps back toward another site's page instead of the fallback", () => {
    const tab = fakeTab(["/admin/events/e1"], { keys: true, before: true });
    const history = new LeaveHistory(tab.host);
    history.hold();
    let fallback = 0;
    history.backOut(() => (fallback += 1));
    tab.drain(history, () => true);
    expect(fallback).toBe(0);
  });
});
