/** History state key that marks the copy of an entry the shell puts on top while a guard is set. */
const SENTINEL = "__smLeaveGuard";

/** Back steps taken to get past entries at the guarded page's own address, and how long that may take. */
const MAX_SKIPS = 4;
const SKIP_MS = 1500;

type NavEntry = { key: string; url: string | null; index: number };

/** The parts of the Navigation API the guard uses. Entry keys survive replaceState. */
export type NavigationLike = {
  currentEntry: NavEntry | null;
  entries(): NavEntry[];
  traverseTo(key: string): unknown;
};

/** The browser surface LeaveHistory works on: `window` in the shell, a stand-in in tests. */
export type HistoryHost = {
  history: Pick<History, "state" | "length" | "pushState" | "back">;
  location: Pick<Location, "href" | "pathname">;
  navigation?: NavigationLike;
  setTimeout: (run: () => void, ms: number) => unknown;
};

/**
 * The copy on top: its id in history state, the path it copies, the Navigation API keys of the
 * copy and of the entry under it (null without the API), and whether it is the current entry.
 */
type Copy = { id: string; pathname: string; key: string | null; below: string | null; onTop: boolean };

function stateId(state: unknown): unknown {
  return state && typeof state === "object" ? (state as Record<string, unknown>)[SENTINEL] : undefined;
}

/**
 * The history side of the leave guard. While a screen holds unsaved changes, a copy of the current
 * entry sits on top, so the browser's Back lands on the same address and the guard can ask before
 * the page really changes. Next.js and the screens replace history state often, so the copy is
 * recognised by its Navigation API key, or, without the API, by its path while no Back or Forward
 * has moved off it.
 */
export class LeaveHistory {
  private copy: Copy | null = null;
  /** Set while Back steps past entries at this address. */
  private skipping: { href: string; left: number } | null = null;

  constructor(private readonly host: HistoryHost) {}

  private key(): string | null {
    return this.host.navigation?.currentEntry?.key ?? null;
  }

  /** Where the current entry is: the copy, the entry right under it, or anywhere else. */
  private at(copy: Copy, moved: boolean): "copy" | "below" | "other" {
    const key = this.key();
    if (key !== null && copy.key !== null) return key === copy.key ? "copy" : key === copy.below ? "below" : "other";
    if (this.host.location.pathname !== copy.pathname) return "other";
    if (stateId(this.host.history.state) === copy.id) return "copy";
    if (moved) return "below";
    return copy.onTop ? "copy" : "other";
  }

  private push(id: string) {
    const below = this.key();
    const { history, location } = this.host;
    history.pushState({ ...(history.state ?? {}), [SENTINEL]: id }, "", location.href);
    this.copy = { id, pathname: location.pathname, key: this.key(), below, onTop: true };
  }

  /** A guard was set: puts the copy on top, unless the current entry already is the copy. */
  hold() {
    if (this.copy && this.at(this.copy, false) === "copy") return;
    this.push(Math.random().toString(36).slice(2));
  }

  /**
   * After popstate. Back from the copy lands under it on the same page: `ask` returns true when
   * the guard holds the navigation (the copy goes back on top while it asks), false to let it go.
   */
  popped(ask: () => boolean, stuck?: () => void) {
    const skip = this.skipping;
    if (skip) {
      if (this.host.location.href === skip.href && skip.left > 0) {
        skip.left -= 1;
        this.host.history.back();
        return;
      }
      this.skipping = null;
    }
    const copy = this.copy;
    if (!copy) return;
    const wasOnTop = copy.onTop;
    const at = this.at(copy, true);
    copy.onTop = at === "copy";
    if (at !== "below" || !wasOnTop) return;
    if (ask()) this.push(copy.id);
    else this.backOut(stuck);
  }

  /**
   * Goes back past every entry at the current address. `stuck` runs when there is nothing before
   * them, as in a tab opened on this page.
   */
  backOut(stuck?: () => void) {
    this.copy = null;
    const { history, location, navigation } = this.host;
    const here = navigation?.currentEntry;
    if (navigation && here && here.index >= 0) {
      const entries = navigation.entries();
      const earlier = entries
        .slice(0, here.index)
        .reverse()
        .find((entry) => entry.url !== here.url);
      if (earlier) {
        navigation.traverseTo(earlier.key);
        return;
      }
      // Equal lengths mean no other site's entries either, so Back has nowhere to go.
      if (stuck && history.length === entries.length) {
        stuck();
        return;
      }
    }
    const skip = { href: location.href, left: MAX_SKIPS };
    this.skipping = skip;
    // With no entry before this one, Back does nothing and no popstate ends the skip.
    this.host.setTimeout(() => {
      if (this.skipping !== skip) return;
      this.skipping = null;
      if (location.href === skip.href) stuck?.();
    }, SKIP_MS);
    history.back();
  }
}
