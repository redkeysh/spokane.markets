"use client";

import * as React from "react";
import { DialogPortalContext } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Native <dialog> opened with showModal(): the browser traps focus, makes the page inert and
 * closes on Escape. Rendered in place inside the admin root, so the top layer still inherits the
 * admin tokens. Focus starts on the first control, or on the one marked data-autofocus, and
 * returns to the element that was focused when it opened. Menus and tooltips
 * opened inside it portal into the dialog itself, because #sm-layer sits below the top layer.
 */
export function AdminDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "confirm",
  placement = "center",
  hideTitle = false,
  className,
  bodyClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Buttons, right-aligned; the filled one goes last. */
  footer?: React.ReactNode;
  /** confirm: 480 wide. list: 560 wide. */
  size?: "confirm" | "list";
  /** top: 15vh from the top, for Jump. */
  placement?: "center" | "top";
  /** Keeps the title for assistive tech only. */
  hideTitle?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const pressedOnBackdrop = React.useRef(false);
  const [layer, setLayer] = React.useState<HTMLDivElement | null>(null);
  const titleId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    const target = returnTo.current;
    returnTo.current = null;
    if (target?.isConnected && (document.activeElement === document.body || document.activeElement === null)) {
      target.focus();
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={handleClose}
      onPointerDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pressedOnBackdrop.current && e.target === e.currentTarget) onOpenChange(false);
        pressedOnBackdrop.current = false;
      }}
      className={cn(
        "sm-dialog sm-float m-auto max-h-[85dvh] w-[calc(100vw-32px)] overflow-hidden rounded-lg p-0 text-left font-text font-normal whitespace-normal text-basalt",
        size === "confirm" ? "max-w-[480px]" : "max-w-[560px]",
        placement === "top" && "mt-[15vh] mb-auto",
        className
      )}
    >
      {open && (
        <DialogPortalContext.Provider value={layer}>
          <div className="flex max-h-[85dvh] flex-col">
            <div className={cn("px-6 pt-5 pb-2", hideTitle && "sr-only")}>
              <h2 id={titleId} className="font-display text-xl/[26px] font-bold text-basalt">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 max-w-[72ch] text-sm text-ash">
                  {description}
                </p>
              )}
            </div>
            <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-2 focus-visible:outline-offset-[-2px]", bodyClassName)}>{children}</div>
            {footer && (
              <div className="flex flex-wrap items-center justify-end gap-2 px-6 pt-3 pb-5">{footer}</div>
            )}
          </div>
          <div ref={setLayer} />
        </DialogPortalContext.Provider>
      )}
    </dialog>
  );
}
