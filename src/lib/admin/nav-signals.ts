/** Honey dots for the admin top bar. getNavSignals returns fixed values from 2026-11-03. */

/** `label` is the accessible name and tooltip, e.g. "To do: 21 waiting this weekend". */
export type NavSignal = { dot: boolean; label: string };

export type NavSignals = { todo: NavSignal; markets: NavSignal; venues: NavSignal };

export async function getNavSignals(): Promise<NavSignals> {
  return {
    todo: { dot: true, label: "To do: 21 waiting this weekend, nothing from the public" },
    markets: { dot: false, label: "Markets: none waiting for verification" },
    venues: { dot: true, label: "Venues: 14 duplicate groups, 3 archived places in use" },
  };
}
