"use client";

import { Segmented } from "@/components/admin/kit/segmented";
import { useShell } from "@/components/admin/shell/shell-context";
import type { AdminMode } from "@/lib/admin/preferences";

const MODE_OPTIONS: { value: AdminMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const KEY_OPTIONS: { value: "on" | "off"; label: string }[] = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

/** Color mode and single-key shortcuts. Both are saved for this browser and take effect at once. */
export function Preferences() {
  const { mode, setMode, singleKeys, setSingleKeys } = useShell();
  return (
    <div className="divide-y divide-seam border-y border-seam bg-sheet">
      <div className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start">
        <span className="text-sm font-medium text-basalt sm:pt-1">Color mode</span>
        <div className="flex flex-col gap-1">
          <Segmented label="Color mode" options={MODE_OPTIONS} value={mode} onChange={setMode} className="self-start" />
          <p className="text-xs text-ash">System follows your device. The mode button in the top bar cycles the same three.</p>
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-start">
        <span className="text-sm font-medium text-basalt sm:pt-1">Single-key shortcuts</span>
        <div className="flex flex-col gap-1">
          <Segmented
            label="Single-key shortcuts"
            options={KEY_OPTIONS}
            value={singleKeys ? "on" : "off"}
            onChange={(value) => setSingleKeys(value === "on")}
            className="self-start"
          />
          <p className="max-w-[72ch] text-xs text-ash">
            Keys such as P, X and J act on their own. Turn them off if you use speech input or press keys by accident;
            Ctrl combinations keep working.
          </p>
        </div>
      </div>
    </div>
  );
}
