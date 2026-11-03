"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ADMIN_NAV, hasWeekChips, railVariant } from "@/lib/admin/nav";
import type { NavSignals } from "@/lib/admin/nav-signals";
import type { AdminMode } from "@/lib/admin/preferences";
import type { WeekendRail } from "@/lib/admin/weekends";
import { DialogPortalContext } from "@/components/ui/dialog";
import { AdminToaster } from "@/components/admin/kit/toaster";
import { SingleKeysContext, useShortcuts } from "@/components/admin/kit/use-shortcuts";
import { BottomBar } from "./bottom-bar";
import { AnnounceProvider, LiveRegion, useLiveRegionState } from "./live-region";
import { setAdminMode, setSingleKeyShortcuts } from "./mode-actions";
import { MODE_LABEL, ShellContext, type ShellContextValue } from "./shell-context";
import { Rail } from "./rail";
import { RailProvider } from "./rail-context";
import { RailSlim } from "./rail-slim";
import { ShortcutSheet } from "./shortcut-sheet";
import { TopBar } from "./top-bar";
import { useMediaQuery } from "./use-media";
import { WeekChips } from "./week-chips";

/** cmdk and its Radix dialog stay out of the page bundle; the chunk loads once the shell is idle. */
const JumpDialog = dynamic(() => import("./jump/jump-dialog").then((m) => m.JumpDialog), { ssr: false });

function usePreloadJump() {
  React.useEffect(() => {
    const load = () => void import("./jump/jump-dialog");
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(load, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = window.setTimeout(load, 1000);
    return () => window.clearTimeout(timer);
  }, []);
}

/**
 * In pane mode, pages without a .sm-screen root scroll inside <main>, so it takes a tab stop to
 * scroll by keyboard. .sm-screen pages scroll in their panes, and in page mode the document scrolls.
 */
function useMainTabStop(main: HTMLElement | null) {
  const paneMode = useMediaQuery("(min-width: 1024px) and (min-height: 600px)", true);
  React.useEffect(() => {
    if (!main) return;
    const update = () => {
      main.setAttribute("tabindex", paneMode && !main.querySelector(":scope > .sm-screen") ? "0" : "-1");
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(main, { childList: true });
    return () => observer.disconnect();
  }, [main, paneMode]);
}

function navHref(key: string): string {
  return ADMIN_NAV.find((item) => item.key === key)?.href ?? "/admin";
}

/** Shortcuts that work on every admin screen. */
function GlobalShortcuts({ onJump, onSheet }: { onJump: () => void; onSheet: () => void }) {
  const router = useRouter();
  useShortcuts({
    "/": onJump,
    "mod+k": onJump,
    "?": onSheet,
    "g t": () => router.push(navHref("todo")),
    "g e": () => router.push(navHref("events")),
    "g m": () => router.push(navHref("markets")),
    "g v": () => router.push(navHref("venues")),
    "g s": () => router.push(navHref("site")),
    n: () => router.push("/admin/events/new"),
  });
  return null;
}

/**
 * The admin's theme scope and chrome: top bar, rail, the screen, the phone bottom bar, and the
 * layer, toaster, live region and dialogs that must sit inside the scope to inherit its tokens.
 */
export function AdminRoot({
  mode: savedMode,
  singleKeys: savedSingleKeys,
  rail,
  signals,
  className,
  children,
}: {
  mode: AdminMode;
  singleKeys: boolean;
  rail: WeekendRail;
  signals: NavSignals;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [layer, setLayer] = React.useState<HTMLDivElement | null>(null);
  const [main, setMain] = React.useState<HTMLElement | null>(null);
  useMainTabStop(main);
  const [jumpOpen, setJumpOpen] = React.useState(false);
  const [jumpMounted, setJumpMounted] = React.useState(false);
  const openJump = React.useCallback(() => {
    setJumpMounted(true);
    setJumpOpen(true);
  }, []);
  usePreloadJump();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [liveMessage, announce] = useLiveRegionState();

  // The cookie-backed values arrive again after each server action; local state answers at once.
  const [mode, setModeState] = React.useState(savedMode);
  const [singleKeys, setSingleKeysState] = React.useState(savedSingleKeys);
  const [saved, setSaved] = React.useState({ mode: savedMode, singleKeys: savedSingleKeys });
  if (saved.mode !== savedMode || saved.singleKeys !== savedSingleKeys) {
    setSaved({ mode: savedMode, singleKeys: savedSingleKeys });
    setModeState(savedMode);
    setSingleKeysState(savedSingleKeys);
  }

  const [, startTransition] = React.useTransition();

  const shell = React.useMemo<ShellContextValue>(
    () => ({
      mode,
      setMode: (next) => {
        setModeState(next);
        announce(`Color mode: ${MODE_LABEL[next]}`);
        startTransition(() => setAdminMode(next));
      },
      singleKeys,
      setSingleKeys: (on) => {
        setSingleKeysState(on);
        announce(on ? "Single-key shortcuts are on." : "Single-key shortcuts are off.");
        startTransition(() => setSingleKeyShortcuts(on));
      },
      openJump,
      openShortcuts: () => setSheetOpen(true),
    }),
    [mode, singleKeys, announce, openJump]
  );

  const full = railVariant(pathname) === "full";
  const chips = hasWeekChips(pathname);

  return (
    <div data-theme="admin" data-mode={mode} className={cn("sm-shell", className)}>
      <ShellContext.Provider value={shell}>
        <SingleKeysContext.Provider value={singleKeys}>
          <DialogPortalContext.Provider value={layer}>
            <AnnounceProvider value={announce}>
              <RailProvider rail={rail}>
                <a className="skip-link" href="#sm-main">
                  Skip to main content
                </a>
                <TopBar signals={signals} />
                <div>
                  {full ? (
                    <Rail className="hidden lg:block" />
                  ) : (
                    <RailSlim className={chips ? "hidden lg:block" : "hidden md:block"} />
                  )}
                  {chips && <WeekChips className="lg:hidden" />}
                </div>
                <main ref={setMain} id="sm-main" tabIndex={-1} aria-label="Main content" className="sm-main">
                  {children}
                </main>
                <BottomBar signals={signals} />
                <div className="sm-overlays">
                  <div id="sm-layer" ref={setLayer} />
                  <AdminToaster mode={mode} />
                  <LiveRegion message={liveMessage} />
                  {jumpMounted && <JumpDialog open={jumpOpen} onOpenChange={setJumpOpen} />}
                  <ShortcutSheet open={sheetOpen} onOpenChange={setSheetOpen} />
                </div>
                <GlobalShortcuts onJump={openJump} onSheet={() => setSheetOpen(true)} />
              </RailProvider>
            </AnnounceProvider>
          </DialogPortalContext.Provider>
        </SingleKeysContext.Provider>
      </ShellContext.Provider>
    </div>
  );
}
