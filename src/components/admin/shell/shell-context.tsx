"use client";

import { createContext, useContext } from "react";
import type { AdminMode } from "@/lib/admin/preferences";

export type ShellContextValue = {
  mode: AdminMode;
  setMode: (mode: AdminMode) => void;
  singleKeys: boolean;
  setSingleKeys: (on: boolean) => void;
  openJump: () => void;
  openShortcuts: () => void;
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
