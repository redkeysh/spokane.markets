/**
 * Sends Jump's searches one at a time, newest query only. A query waits out the
 * debounce; while a search is running, newer queries wait, and any query
 * replaced before it was sent is never sent. Results for a query that is no
 * longer the newest are dropped. Server actions run one after another, so this
 * keeps typing from building a queue of stale requests.
 */

export type SearchOutcome<R> = { query: string; ok: true; results: R } | { query: string; ok: false };

export type LatestSearch<R> = {
  /** Asks for `query`; null cancels whatever has not been sent. */
  request(query: string | null): void;
  /** Results already received for `query`, without a request. */
  cached(query: string): R | undefined;
};

const CACHE_SIZE = 24;

export function createLatestSearch<R>(
  run: (query: string) => Promise<R>,
  onOutcome: (outcome: SearchOutcome<R>) => void,
  delayMs: number
): LatestSearch<R> {
  let wanted: string | null = null;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cache = new Map<string, R>();

  const remember = (query: string, results: R) => {
    cache.delete(query);
    cache.set(query, results);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  };

  const send = (query: string) => {
    running = true;
    run(query).then(
      (results) => finish({ query, ok: true, results }),
      () => finish({ query, ok: false })
    );
  };

  const finish = (outcome: SearchOutcome<R>) => {
    running = false;
    if (outcome.ok) remember(outcome.query, outcome.results);
    if (outcome.query === wanted) {
      onOutcome(outcome);
      return;
    }
    if (wanted !== null && timer === null) start();
  };

  const start = () => {
    timer = null;
    if (running || wanted === null) return;
    const hit = cache.get(wanted);
    if (hit !== undefined) {
      onOutcome({ query: wanted, ok: true, results: hit });
      return;
    }
    send(wanted);
  };

  return {
    request(query) {
      if (query === wanted) return;
      wanted = query;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (query === null) return;
      if (cache.has(query)) {
        start();
        return;
      }
      timer = setTimeout(start, delayMs);
    },
    cached(query) {
      return cache.get(query);
    },
  };
}
