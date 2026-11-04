"use client";

import * as React from "react";
import { AdminButton, type AdminButtonVariant } from "@/components/admin/kit/button";
import { Menu, type MenuItem } from "@/components/admin/kit/menu";
import { LeavePrompt } from "@/components/admin/kit/save-bar";
import { cn } from "@/lib/utils";
import { EDITOR_WIDTH } from "./editor-shell";

export type BarButton = {
  label: string;
  onClick: () => void;
  keys?: string;
  busy?: boolean;
  busyLabel?: string;
  disabled?: boolean;
  variant?: AdminButtonVariant;
};

/**
 * The editor's one action bar: a grid row under the scroller in pane mode, stuck to the bottom in
 * page mode. Left: the status sentence with Change, then unsaved changes or when it was saved.
 * Right: More, Cancel, Save and the one filled button. Leaving with unsaved changes asks here.
 */
export function ActionBar({
  statusSentence,
  statusControl,
  stateText,
  message,
  more,
  cancel,
  secondary,
  primary,
  leavePrompt,
}: {
  statusSentence: string;
  statusControl?: React.ReactNode;
  /** "2 unsaved changes" or "Saved 2 min ago". */
  stateText: string | null;
  /** The result of the last action. The editor announces it through the live region. */
  message: { kind: "error" | "info"; text: string } | null;
  more: MenuItem[];
  cancel: BarButton | null;
  secondary: BarButton | null;
  primary: BarButton | null;
  leavePrompt: { onSave: () => void; onDiscard: () => void; onStay: () => void; busy: boolean } | null;
}) {
  return (
    <div className="sm-sticky-bottom border-t border-seam bg-sheet" data-editor-action-bar>
      <div className={cn(EDITOR_WIDTH, "flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 py-2.5 md:flex-nowrap")}>
        {leavePrompt ? (
          <LeavePrompt
            onStay={leavePrompt.onStay}
            onDiscard={leavePrompt.onDiscard}
            onSave={leavePrompt.onSave}
            saving={leavePrompt.busy}
            className="w-full"
          />
        ) : (
          <>
            <div className="flex min-w-0 flex-1 basis-full flex-wrap items-center gap-x-3 gap-y-1 md:basis-auto">
              <p className="hidden min-w-0 items-center gap-2 text-sm text-basalt md:flex">
                <span className="truncate" title={statusSentence}>
                  {statusSentence}
                </span>
                {statusControl}
              </p>
              <p
                className={cn(
                  "min-w-0 text-xs tabular-nums md:text-sm",
                  message?.kind === "error" ? "text-ponderosa" : "text-ash",
                  !message && !stateText && "hidden"
                )}
              >
                {message?.text ?? stateText}
              </p>
            </div>
            <div className="flex w-full shrink-0 items-center justify-end gap-2 md:w-auto">
              {more.length > 0 && (
                <>
                  <Menu items={more} label="More actions" variant="outline" size="icon" placement="top-end" className="size-9 pointer-coarse:size-11 xl:hidden" />
                  <Menu items={more} label="More actions" trigger="More" variant="outline" size="md" placement="top-end" className="hidden xl:inline-flex" />
                </>
              )}
              {cancel && (
                <AdminButton
                  data-editor-cancel
                  variant="outline"
                  keys={cancel.keys}
                  onClick={cancel.onClick}
                  disabled={cancel.disabled}
                  className="hidden md:inline-flex [&_kbd]:hidden lg:[&_kbd]:inline-flex"
                >
                  {cancel.label}
                </AdminButton>
              )}
              {secondary && (
                <AdminButton
                  variant={secondary.variant ?? "outline"}
                  keys={secondary.keys}
                  onClick={secondary.onClick}
                  busy={secondary.busy}
                  busyLabel={secondary.busyLabel}
                  disabled={secondary.disabled}
                  className="flex-1 pointer-coarse:h-12 md:flex-none [&_kbd]:hidden lg:[&_kbd]:inline-flex"
                >
                  {secondary.label}
                </AdminButton>
              )}
              {primary && (
                <AdminButton
                  variant={primary.variant ?? "publish"}
                  keys={primary.keys}
                  onClick={primary.onClick}
                  busy={primary.busy}
                  busyLabel={primary.busyLabel}
                  disabled={primary.disabled}
                  className="flex-1 pointer-coarse:h-12 md:flex-none [&_kbd]:hidden lg:[&_kbd]:inline-flex"
                >
                  {primary.label}
                </AdminButton>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
