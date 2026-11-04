"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LeaveHistory, type NavigationLike } from "./leave-history";
import { useShell, type LeaveGuard, type LeaveTarget, type ShellContextValue } from "./shell-context";

/**
 * The same-origin address a plain left click on a link would open in this tab, or null when the
 * click opens nothing here: modifier keys, another tab, a download, another site, the same address
 * (a hash link), or a link inside [data-leave-ok], whose own handler asks before leaving.
 */
export function clickedHref(event: MouseEvent, here: URL): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target as Element | null;
  const link = typeof target?.closest === "function" ? (target.closest("a[href]") as HTMLAnchorElement | null) : null;
  if (!link || link.hasAttribute("download") || link.closest("[data-leave-ok]")) return null;
  if (link.target && link.target !== "_self") return null;
  const url = new URL(link.href, here);
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

type Registered = { guard: LeaveGuard; backTo?: string };

/**
 * The shell's side of the leave guard, for AdminRoot. While a screen's guard is set, link clicks
 * ask it first, closing the tab gets the browser's own prompt, and LeaveHistory keeps a copy of
 * the current entry on top so the browser's Back asks too.
 */
export function useLeaveGuardHost(): Pick<ShellContextValue, "navigate" | "leave" | "setLeaveGuard"> {
  const router = useRouter();
  /** Registered guards, newest last; the newest one answers. */
  const guards = React.useRef<Registered[]>([]);
  const [guarded, setGuarded] = React.useState(false);
  const tracker = React.useRef<LeaveHistory | null>(null);

  const history = React.useCallback(
    () =>
      (tracker.current ??= new LeaveHistory({
        history: window.history,
        location: window.location,
        navigation: (window as unknown as { navigation?: NavigationLike }).navigation,
        setTimeout: (run, ms) => window.setTimeout(run, ms),
      })),
    []
  );

  const ask = React.useCallback((target: LeaveTarget) => guards.current.at(-1)?.guard(target) ?? false, []);

  /** Where Back goes when the guarded page was the first in the tab. */
  const fallback = React.useCallback(
    (target: LeaveTarget) => () => {
      if (target.kind === "back" && target.fallback) router.push(target.fallback);
    },
    [router]
  );

  const setLeaveGuard = React.useCallback((guard: LeaveGuard, backTo?: string) => {
    const entry: Registered = { guard, backTo };
    guards.current = [...guards.current, entry];
    setGuarded(true);
    return () => {
      guards.current = guards.current.filter((g) => g !== entry);
      setGuarded(guards.current.length > 0);
    };
  }, []);

  const navigate = React.useCallback(
    (href: string) => {
      if (ask({ kind: "href", href })) return;
      router.push(href);
    },
    [ask, router]
  );

  const leave = React.useCallback(
    (target: LeaveTarget) => {
      if (target.kind === "href") router.push(target.href);
      else history().backOut(fallback(target));
    },
    [router, history, fallback]
  );

  React.useEffect(() => {
    const onPopState = () => {
      const target: LeaveTarget = { kind: "back", fallback: guards.current.at(-1)?.backTo };
      history().popped(() => ask(target), fallback(target));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [ask, history, fallback]);

  React.useEffect(() => {
    if (!guarded) return;
    history().hold();

    const onClick = (event: MouseEvent) => {
      const href = clickedHref(event, new URL(window.location.href));
      if (!href || !ask({ kind: "href", href })) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    // Capture phase, so the guard answers before next/link starts the navigation.
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [guarded, ask, history]);

  return { navigate, leave, setLeaveGuard };
}

/**
 * Holds every way out of the admin while `active` (a screen's unsaved changes): links, shortcuts,
 * Jump, the browser's Back and closing the tab. `ask` shows the screen's own question and later
 * calls `leave(target)` from useShell(), or returns false to let the navigation go ahead.
 * `backTo` is where Back goes after Discard when there is no earlier page in the tab.
 */
export function useLeaveGuard(active: boolean, ask: (target: LeaveTarget) => boolean | void, backTo?: string) {
  const { setLeaveGuard } = useShell();
  const askRef = React.useRef(ask);
  React.useEffect(() => {
    askRef.current = ask;
  });
  React.useEffect(() => {
    if (!active) return;
    return setLeaveGuard((target) => askRef.current(target) !== false, backTo);
  }, [active, backTo, setLeaveGuard]);
}

/**
 * useLeaveGuard for a form that asks with the kit's LeavePrompt: `leaving` is the held navigation
 * while the prompt shows, `stay` drops it, and `go` completes it (or another target) without
 * asking again.
 */
export function useLeavePrompt(dirty: boolean, backTo?: string) {
  const { leave } = useShell();
  const [leaving, setLeaving] = React.useState<LeaveTarget | null>(null);
  useLeaveGuard(dirty, setLeaving, backTo);
  const stay = React.useCallback(() => setLeaving(null), []);
  const go = React.useCallback(
    (target: LeaveTarget | null) => {
      setLeaving(null);
      if (target) leave(target);
    },
    [leave]
  );
  return { leaving, stay, go };
}
