"use client";

import * as React from "react";
import Link from "next/link";
import { autoUpdate, flip, offset, shift, useFloating, type Placement } from "@floating-ui/react-dom";
import { Check, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminButtonClass, type AdminButtonSize, type AdminButtonVariant } from "./button";
import { LayerPortal } from "./layer";
import { Tooltip } from "./tooltip";

export type MenuItem = {
  label: string;
  /** One consequence line under the label, e.g. "On the site." */
  description?: string;
  onSelect?: () => void;
  href?: string;
  /** Opens in a new tab. */
  external?: boolean;
  danger?: boolean;
  disabled?: boolean;
  /** Makes the item a menuitemradio. */
  checked?: boolean;
};

/**
 * A button that opens a list of actions. Portals into #sm-layer and flips above the trigger when
 * there is no room below (for example over an action bar).
 */
export function Menu({
  items,
  label = "More actions",
  trigger,
  variant = "quiet",
  size = "icon-sm",
  placement = "bottom-end",
  className,
}: {
  items: MenuItem[];
  /** Accessible name of the trigger and its tooltip when it is icon-only. */
  label?: string;
  /** Visible trigger content; omitted, the trigger is the MoreHorizontal icon. */
  trigger?: React.ReactNode;
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  placement?: Placement;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [triggerEl, setTriggerEl] = React.useState<HTMLButtonElement | null>(null);
  const [floating, setFloating] = React.useState<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<(HTMLElement | null)[]>([]);
  const menuId = React.useId();
  const { floatingStyles } = useFloating({
    placement,
    strategy: "fixed",
    open,
    elements: { reference: triggerEl, floating },
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);

  const openAt = (index: number) => {
    setActive(index);
    setOpen(true);
  };

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) triggerEl?.focus();
  };

  React.useEffect(() => {
    if (open) itemRefs.current[active]?.focus();
  }, [open, active]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (floating?.contains(target) || triggerEl?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, floating, triggerEl]);

  const move = (delta: number) => {
    const pos = enabled.indexOf(active);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    if (next !== undefined) setActive(next);
  };

  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        if (enabled.length) setActive(enabled[0]);
        break;
      case "End":
        e.preventDefault();
        if (enabled.length) setActive(enabled[enabled.length - 1]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case "Tab":
        // Focus moves back to the trigger first, so the browser tabs on from there.
        close(true);
        break;
    }
  };

  const select = (item: MenuItem) => {
    if (item.disabled) return;
    close(!item.href);
    item.onSelect?.();
  };

  const iconOnly = trigger === undefined;
  const button = (
    <button
      ref={setTriggerEl}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      aria-label={iconOnly ? label : undefined}
      data-row-action
      className={adminButtonClass({ variant, size, className })}
      onClick={() => (open ? close(false) : openAt(enabled[0] ?? 0))}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          openAt(enabled[0] ?? 0);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          openAt(enabled[enabled.length - 1] ?? 0);
        }
      }}
    >
      {iconOnly ? <MoreHorizontal strokeWidth={1.75} aria-hidden="true" /> : trigger}
    </button>
  );

  const hasRadio = items.some((item) => item.checked !== undefined);

  return (
    <>
      {iconOnly ? <Tooltip content={label}>{button}</Tooltip> : button}
      {open && (
        <LayerPortal>
          <div
            ref={setFloating}
            id={menuId}
            role="menu"
            aria-label={label}
            style={floatingStyles}
            onKeyDown={onMenuKeyDown}
            className="sm-float z-40 min-w-48 max-w-80 rounded-lg p-1 font-text text-sm text-basalt"
          >
            {items.map((item, i) => {
              const itemClass = cn(
                "flex w-full cursor-default items-start gap-2 rounded-md px-2 py-1.5 text-left outline-offset-[-2px] hover:bg-hover focus-visible:bg-lilac-tint aria-disabled:opacity-50",
                item.danger ? "text-ponderosa" : "text-basalt"
              );
              const body = (
                <>
                  {hasRadio && (
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
                      {item.checked && <Check className="size-4" strokeWidth={1.75} />}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-medium">{item.label}</span>
                    {item.description && <span className="block text-xs text-ash">{item.description}</span>}
                  </span>
                </>
              );
              const common = {
                ref: (node: HTMLElement | null) => {
                  itemRefs.current[i] = node;
                },
                role: item.checked !== undefined ? "menuitemradio" : "menuitem",
                "aria-checked": item.checked,
                "aria-disabled": item.disabled || undefined,
                tabIndex: i === active ? 0 : -1,
                className: itemClass,
                onPointerMove: () => !item.disabled && setActive(i),
              } as const;
              if (item.href && !item.disabled) {
                return (
                  <Link
                    key={item.label}
                    {...common}
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noreferrer" : undefined}
                    onClick={() => select(item)}
                  >
                    {body}
                  </Link>
                );
              }
              return (
                <button key={item.label} type="button" {...common} onClick={() => select(item)}>
                  {body}
                </button>
              );
            })}
          </div>
        </LayerPortal>
      )}
    </>
  );
}
