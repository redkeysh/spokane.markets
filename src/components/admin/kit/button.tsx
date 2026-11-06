import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { HIDDEN_ON_PHONES, KeyHint, toAriaKeyShortcuts } from "./key-hint";

export type AdminButtonVariant = "publish" | "ink" | "outline" | "quiet" | "danger" | "danger-outline";
export type AdminButtonSize = "md" | "sm" | "lg" | "icon" | "icon-sm";

/** Filled variants carry a transparent border so forced-colors mode still draws their edge. */
const VARIANT: Record<AdminButtonVariant, string> = {
  publish: "border border-transparent bg-cedar text-on-cedar hover:bg-cedar-hover",
  ink: "border border-transparent bg-basalt text-on-basalt hover:bg-basalt-hover",
  outline: "border border-seam-strong bg-sheet text-basalt hover:bg-hover",
  quiet: "text-ash hover:bg-hover hover:text-basalt",
  danger: "border border-transparent bg-ponderosa text-on-ponderosa hover:bg-ponderosa/90",
  "danger-outline": "border border-ponderosa bg-sheet text-ponderosa hover:bg-ponderosa-tint",
};

const FILLED: ReadonlySet<AdminButtonVariant> = new Set(["publish", "ink", "danger"]);
const PRIMARY: ReadonlySet<AdminButtonVariant> = new Set(["publish", "ink"]);

const SIZE: Record<AdminButtonSize, string> = {
  md: "h-9 px-3",
  sm: "h-[30px] px-3",
  lg: "h-11 px-4",
  icon: "size-8 p-0",
  "icon-sm": "size-[30px] p-0",
};

export function adminButtonClass({
  variant = "outline",
  size = "md",
  className,
}: {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  className?: string;
} = {}) {
  const primary = PRIMARY.has(variant);
  const iconOnly = size === "icon" || size === "icon-sm";
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-text text-sm font-medium transition-colors duration-[80ms] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    VARIANT[variant],
    SIZE[size],
    primary && !iconOnly && size !== "lg" && "px-4 pointer-coarse:h-11",
    className
  );
}

type Common = {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  /** Key hint after the label, e.g. "P" or "Ctrl+S". Only on decision rows, the editor action bar and the shortcut sheet. */
  keys?: string;
};

function Label({
  children,
  busy,
  busyLabel,
}: {
  children: React.ReactNode;
  busy?: boolean;
  busyLabel?: string;
}) {
  if (!busyLabel) return <>{children}</>;
  return (
    <span className="grid">
      <span className={cn("col-start-1 row-start-1 inline-flex items-center justify-center gap-2", busy && "invisible")}>
        {children}
      </span>
      <span className={cn("col-start-1 row-start-1 text-center", !busy && "invisible")}>{busyLabel}</span>
    </span>
  );
}

export type AdminButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  Common & {
    /** While busy the button keeps its width and shows `busyLabel` ("Publishing"). */
    busy?: boolean;
    busyLabel?: string;
  };

export const AdminButton = React.forwardRef<HTMLButtonElement, AdminButtonProps>(function AdminButton(
  { variant = "outline", size = "md", keys, busy = false, busyLabel, className, children, disabled, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={adminButtonClass({ variant, size, className })}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-keyshortcuts={keys ? toAriaKeyShortcuts(keys) : undefined}
      {...props}
    >
      <Label busy={busy} busyLabel={busyLabel}>
        {children}
      </Label>
      {keys && <KeyHint keys={keys} inverse={FILLED.has(variant)} className={HIDDEN_ON_PHONES} />}
    </button>
  );
});

export type AdminLinkButtonProps = React.ComponentProps<typeof Link> & Common;

/** A link styled as a button, for navigation actions ("New event"). */
export function AdminLinkButton({
  variant = "outline",
  size = "md",
  keys,
  className,
  children,
  ...props
}: AdminLinkButtonProps) {
  return (
    <Link
      className={adminButtonClass({ variant, size, className })}
      aria-keyshortcuts={keys ? toAriaKeyShortcuts(keys) : undefined}
      {...props}
    >
      {children}
      {keys && <KeyHint keys={keys} inverse={FILLED.has(variant)} className={HIDDEN_ON_PHONES} />}
    </Link>
  );
}
