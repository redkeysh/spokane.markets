"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** 36 px on desktop, 44 px with 16 px text on a coarse pointer (stops iOS zoom). */
export const CONTROL_CLASS =
  "h-9 w-full rounded-md border border-seam-strong bg-sheet px-3 font-text text-sm text-basalt disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-ponderosa pointer-coarse:h-11 pointer-coarse:text-base";

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, type = "text", ...props }, ref) {
    return <input ref={ref} type={type} className={cn(CONTROL_CLASS, className)} {...props} />;
  }
);

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, rows = 3, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(CONTROL_CLASS, "h-auto min-h-20 py-2 leading-5 pointer-coarse:h-auto", className)}
        {...props}
      />
    );
  }
);

export const SelectInput = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectInput({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(CONTROL_CLASS, "px-2", className)} {...props}>
        {children}
      </select>
    );
  }
);

/** A native checkbox with its label; the whole label is the 24 px target. */
export function CheckboxField({
  checked,
  onCheckedChange,
  children,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex min-h-6 cursor-pointer items-center gap-2 font-text text-sm text-basalt has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
        className
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="size-4 shrink-0 cursor-pointer rounded-sm accent-basalt"
      />
      {children}
    </label>
  );
}

/**
 * An on or off setting with its visible label. The label names the setting and the state is
 * announced by role="switch".
 */
export function SwitchField({
  checked,
  onCheckedChange,
  label,
  help,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: React.ReactNode;
  help?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = React.useId();
  const helpId = `${id}-help`;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={help ? helpId : undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-[80ms] disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "border-basalt bg-basalt" : "border-seam-strong bg-sheet"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "block size-4 rounded-full transition-transform duration-[80ms] motion-reduce:transition-none",
            checked ? "translate-x-5 bg-on-basalt" : "translate-x-1 bg-seam-strong"
          )}
        />
      </button>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer font-text text-sm font-medium text-basalt">
          {label}
        </label>
        {help && (
          <p id={helpId} className="mt-0.5 text-xs text-ash">
            {help}
          </p>
        )}
      </div>
    </div>
  );
}

/** An error for a whole form or dialog, announced when it appears. */
export function FormError({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("font-text text-sm text-ponderosa", className)}>
      {children}
    </p>
  );
}
