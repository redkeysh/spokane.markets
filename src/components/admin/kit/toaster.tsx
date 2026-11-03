"use client";

import { Check } from "lucide-react";
import { Toaster, toast } from "sonner";
import type { AdminMode } from "@/lib/admin/preferences";

const DURATION = 6000;
const UNDO_DURATION = 10000;

/**
 * The admin's own sonner Toaster, mounted inside the theme scope (the root one is skipped under
 * /admin). Toasts sit above the phone bottom bar; sonner's motion is switched off in globals.css.
 */
export function AdminToaster({ mode }: { mode: AdminMode }) {
  const offset = { bottom: "calc(var(--sm-bottom-bar-h, 0px) + 16px)" };
  return (
    <Toaster
      position="bottom-center"
      theme={mode}
      duration={DURATION}
      offset={offset}
      mobileOffset={offset}
      className="sm-toaster"
      icons={{ success: <Check className="size-4" strokeWidth={1.75} aria-hidden="true" /> }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "sm-float flex w-[min(420px,calc(100vw-32px))] items-center gap-3 rounded-lg px-4 py-3 font-text text-sm text-basalt",
          title: "font-normal",
          description: "mt-0.5 text-xs text-ash",
          icon: "text-ash",
          actionButton:
            "ml-auto inline-flex h-[30px] shrink-0 items-center rounded-md px-2 font-medium text-lilac hover:bg-hover",
          cancelButton: "inline-flex h-[30px] shrink-0 items-center rounded-md px-2 font-medium text-ash hover:bg-hover",
        },
      }}
    />
  );
}

/** A result toast with Undo, held for 10 seconds. */
export function toastWithUndo(message: string, onUndo: () => void) {
  return toast(message, { duration: UNDO_DURATION, action: { label: "Undo", onClick: onUndo } });
}
