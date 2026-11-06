"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The editor's sizes on top of ui/* (which already take the admin tokens): 36 px tall, 44 px and
 * 16 px text on touch, a ponderosa border when invalid. The focus ring is the admin's own outline
 * rather than ui's box-shadow ring.
 */
const controlClass =
  "min-w-0 font-text text-basalt placeholder:text-ash-quiet aria-[invalid=true]:border-ponderosa pointer-coarse:text-base focus-visible:outline-solid focus-visible:ring-0";

/** Input types whose native picker opens with Alt+Down or Alt+Up. */
const PICKER_INPUTS = new Set(["date", "datetime-local", "month", "week", "time"]);

/**
 * Keeps Alt+Down and Alt+Up for a native select or date picker, which open with them: stops the
 * event before the document's shortcut listeners, which run after React's root listener.
 */
export function keepPickerKeys(e: React.KeyboardEvent) {
  if (!e.altKey || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
  const target = e.target;
  if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && PICKER_INPUTS.has(target.type))) {
    e.nativeEvent.stopImmediatePropagation();
  }
}

export const EditorInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function EditorInput(
  { className, ...props },
  ref
) {
  return <Input ref={ref} className={cn(controlClass, "h-9 py-0 read-only:bg-fog pointer-coarse:h-11", className)} {...props} />;
});

export const EditorSelect = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function EditorSelect(
  { className, children, ...props },
  ref
) {
  return (
    <Select ref={ref} className={cn(controlClass, "h-9 px-2.5 py-0 pointer-coarse:h-11", className)} {...props}>
      {children}
    </Select>
  );
});

/** A textarea that grows with its text. `singleLine` turns Enter into nothing, for titles. */
export const EditorTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { singleLine?: boolean; long?: boolean }
>(function EditorTextarea({ className, singleLine = false, long = false, onKeyDown, onChange, ...props }, ref) {
  return (
    <Textarea
      ref={ref}
      rows={singleLine ? 1 : 3}
      onKeyDown={(e) => {
        if (singleLine && e.key === "Enter") e.preventDefault();
        onKeyDown?.(e);
      }}
      onChange={(e) => {
        if (singleLine && /[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/[\r\n]+/g, " ");
        onChange?.(e);
      }}
      className={cn(
        controlClass,
        "block resize-none read-only:bg-fog [field-sizing:content]",
        singleLine ? "min-h-9 py-[7px] pointer-coarse:min-h-11 pointer-coarse:py-[9px]" : "min-h-24 py-2",
        long && "text-[15px]/[23px]",
        className
      )}
      {...props}
    />
  );
});

/** A checkbox with its label, 24 px target. */
export function EditorCheckbox({
  checked,
  onChange,
  children,
  id,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
  id?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <label className={cn("inline-flex min-h-6 cursor-pointer items-center gap-2 text-sm text-basalt", disabled && "cursor-default opacity-50", className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 rounded-sm border border-seam-strong accent-[var(--sm-basalt)]"
      />
      {children}
    </label>
  );
}

/** On or off, as a switch. */
export function EditorSwitch({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-4">
      <label htmlFor={id} className="text-sm font-medium text-basalt">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border disabled:opacity-50",
          checked ? "border-basalt bg-basalt" : "border-seam-strong bg-sheet"
        )}
      >
        <span
          aria-hidden="true"
          className={cn("block size-4 rounded-full", checked ? "translate-x-[19px] bg-on-basalt" : "translate-x-[3px] bg-seam-strong")}
        />
      </button>
    </div>
  );
}

/** A button that reads as a link, for in-place actions such as "Use these hours". */
export const LinkButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(function LinkButton(
  { className, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex min-h-6 items-center rounded-sm text-left text-sm font-medium text-lilac underline-offset-4 hover:underline disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});
