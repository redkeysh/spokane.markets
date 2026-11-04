import * as React from "react";
import { cn } from "@/lib/utils";

/** 36 px controls on sheet with a seam-strong border; 44 px and 16 px text on touch screens. */
export const CONTROL =
  "h-9 w-full rounded-md border border-seam-strong bg-sheet px-3 font-text text-sm text-basalt disabled:opacity-50 aria-invalid:border-ponderosa pointer-coarse:h-11 pointer-coarse:text-base";

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(CONTROL, className)} {...props} />;
});

export const SelectInput = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function SelectInput(
  { className, children, ...props },
  ref
) {
  return (
    <select ref={ref} className={cn(CONTROL, "px-2", className)} {...props}>
      {children}
    </select>
  );
});

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "field-sizing-content min-h-24 w-full rounded-md border border-seam-strong bg-sheet px-3 py-2 font-text text-[15px]/[23px] text-basalt aria-invalid:border-ponderosa pointer-coarse:text-base",
        className
      )}
      {...props}
    />
  );
});

/** A checkbox with its label on the right; the whole line is the target. */
export function CheckLine({
  checked,
  onChange,
  children,
  help,
  className,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  help?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const helpId = React.useId();
  return (
    <label className={cn("flex min-h-6 cursor-pointer items-start gap-2.5 font-text text-sm text-basalt", disabled && "cursor-default opacity-50", className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={help ? helpId : undefined}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-basalt"
      />
      <span className="min-w-0">
        <span className="block">{children}</span>
        {help && (
          <span id={helpId} className="mt-0.5 block text-xs text-ash">
            {help}
          </span>
        )}
      </span>
    </label>
  );
}
