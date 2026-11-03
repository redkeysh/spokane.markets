"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { AdminMode } from "@/lib/admin/preferences";
import { AdminButton } from "@/components/admin/kit/button";
import { Tooltip } from "@/components/admin/kit/tooltip";
import { MODE_LABEL, NEXT_MODE, useShell } from "./shell-context";

const ICON: Record<AdminMode, typeof Monitor> = { system: Monitor, light: Sun, dark: Moon };

/** Cycles System, Light, Dark. The icon and the name show the current mode. */
export function ModeToggle({ className }: { className?: string }) {
  const { mode, setMode } = useShell();
  const Icon = ICON[mode];
  const label = `Color mode: ${MODE_LABEL[mode]}`;
  return (
    <Tooltip content={label}>
      <AdminButton
        variant="quiet"
        size="icon"
        aria-label={label}
        className={className}
        onClick={() => setMode(NEXT_MODE[mode])}
      >
        <Icon strokeWidth={1.75} aria-hidden="true" />
      </AdminButton>
    </Tooltip>
  );
}
