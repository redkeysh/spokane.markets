"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const BASE =
  "w-full rounded-md border border-seam-strong bg-sheet font-text text-sm text-basalt aria-[invalid=true]:border-ponderosa disabled:opacity-50 pointer-coarse:text-base";

/** A 36 px text field on sheet with a seam-strong border (44 px on touch). */
export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, type = "text", ...props },
  ref
) {
  return <input ref={ref} type={type} className={cn(BASE, "h-9 px-3 pointer-coarse:h-11", className)} {...props} />;
});

/** A text area that grows with its content up to 24rem; `long` sets the 15/23 reading size. */
export const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { long?: boolean }
>(function TextArea({ className, long = false, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(BASE, "field-sizing-content max-h-96 min-h-20 resize-y px-3 py-2", long && "text-[15px]/[23px]", className)}
      {...props}
    />
  );
});

/** A line under a form: the error in ponderosa, announced when it appears. */
export function FormError({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("text-sm text-ponderosa", className)}>
      {children}
    </p>
  );
}
