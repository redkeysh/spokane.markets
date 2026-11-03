"use client";

import * as React from "react";
import { autoUpdate, flip, offset, shift, useFloating, type Placement } from "@floating-ui/react-dom";
import { cn } from "@/lib/utils";
import { LayerPortal } from "./layer";

const OPEN_DELAY = 400;
const CLOSE_DELAY = 120;

/**
 * A short visible label for a control, on hover and on keyboard focus. Escape dismisses it and
 * the pointer can move onto it (WCAG 1.4.13).
 *
 * By default the tooltip is hidden from assistive tech because it repeats the control's
 * accessible name; pass `describe` when it adds information, and it becomes the description.
 */
export function Tooltip({
  content,
  children,
  placement = "bottom",
  describe = false,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: Placement;
  describe?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const openTimer = React.useRef<number | undefined>(undefined);
  const closeTimer = React.useRef<number | undefined>(undefined);
  const id = React.useId();
  const [reference, setReference] = React.useState<HTMLSpanElement | null>(null);
  const [floating, setFloating] = React.useState<HTMLDivElement | null>(null);
  const { floatingStyles } = useFloating({
    placement,
    strategy: "fixed",
    open,
    elements: { reference, floating },
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const clearTimers = () => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  };
  const show = (delay: number) => {
    clearTimers();
    openTimer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = (delay: number) => {
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), delay);
  };

  React.useEffect(() => () => clearTimers(), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const trigger =
    describe && React.isValidElement<{ "aria-describedby"?: string }>(children)
      ? React.cloneElement(children, { "aria-describedby": open ? id : undefined })
      : children;

  return (
    <>
      <span
        ref={setReference}
        className="inline-flex"
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") show(OPEN_DELAY);
        }}
        onPointerLeave={() => hide(CLOSE_DELAY)}
        onPointerDown={() => hide(0)}
        onFocus={(e) => {
          if (e.target instanceof Element && e.target.matches(":focus-visible")) show(0);
        }}
        onBlur={() => hide(0)}
      >
        {trigger}
      </span>
      {open && (
        <LayerPortal>
          <div
            ref={setFloating}
            id={id}
            role="tooltip"
            aria-hidden={describe ? undefined : true}
            style={floatingStyles}
            onPointerEnter={() => clearTimers()}
            onPointerLeave={() => hide(CLOSE_DELAY)}
            className={cn(
              "sm-float z-40 max-w-72 rounded-lg px-2 py-1 font-text text-xs font-medium text-basalt",
              className
            )}
          >
            {content}
          </div>
        </LayerPortal>
      )}
    </>
  );
}
