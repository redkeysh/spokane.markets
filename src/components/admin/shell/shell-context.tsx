"use client";

import { createContext, useContext } from "react";
import type { AdminMode } from "@/lib/admin/preferences";

/**
 * Where a held navigation was going: an admin address, or back in the browser's history, with the
 * address to open instead when the page was the first in its tab.
 */
export type LeaveTarget = { kind: "href"; href: string } | { kind: "back"; fallback?: string };

/**
 * A screen's answer to leaving while it holds unsaved changes: true when it holds the navigation
 * (it asks first, then calls `leave` or drops it), false to let the navigation go ahead.
 */
export type LeaveGuard = (target: LeaveTarget) => boolean;

export type ShellContextValue = {
  mode: AdminMode;
  setMode: (mode: AdminMode) => void;
  singleKeys: boolean;
  setSingleKeys: (on: boolean) => void;
  openJump: () => void;
  openShortcuts: () => void;
  /** Goes to an admin page, unless the screen's leave guard holds the navigation. */
  navigate: (href: string) => void;
  /** Completes a navigation the leave guard held, without asking again. */
  leave: (target: LeaveTarget) => void;
  /**
   * Registers the leave guard of a screen holding unsaved changes and returns the function that
   * removes that guard. The newest guard answers. While one is set, link clicks, `navigate`, the
   * browser's Back and closing the tab all reach it first. `backTo` is where Back goes, once the
   * screen lets it go, when the page was the first in its tab.
   */
  setLeaveGuard: (guard: LeaveGuard, backTo?: string) => () => void;
};

export const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside the admin shell");
  return value;
}

export const MODE_LABEL: Record<AdminMode, string> = { system: "System", light: "Light", dark: "Dark" };

/** The mode button cycles System, Light, Dark. */
export const NEXT_MODE: Record<AdminMode, AdminMode> = { system: "light", light: "dark", dark: "system" };
