import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * An editor section: an anchor, a 15 px heading, 12 px to the first field. No box around it;
 * stack sections with 32 px between them (space-y-8).
 */
export function Section({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-4", className)}>
      <h2 id={headingId} className="font-text text-[15px]/[20px] font-semibold text-basalt">
        {title}
      </h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

type DescribedProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
};

/**
 * Label 6 px above its control, help below, an error below that. The control (the single child)
 * receives the id, aria-describedby and aria-invalid. Required fields say "Required" in the help,
 * never with an asterisk.
 */
export function Field({
  id,
  label,
  help,
  error,
  required = false,
  children,
  className,
}: {
  id: string;
  label: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactElement<DescribedProps>;
  className?: string;
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const helpText = required ? (help ? <>Required. {help}</> : "Required.") : help;
  const describedBy = [helpText ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const control = React.isValidElement(children)
    ? React.cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })
    : children;

  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="block font-text text-sm font-medium text-basalt">
        {label}
      </label>
      <div className="mt-1.5">{control}</div>
      {helpText && (
        <p id={helpId} className="mt-1 text-xs text-ash">
          {helpText}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-xs text-ponderosa">
          {error}
        </p>
      )}
    </div>
  );
}

/** Two fields side by side when the column is at least 560 px wide, stacked otherwise. */
export function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="@container">
      <div className={cn("grid gap-4 @[560px]:grid-cols-2", className)}>{children}</div>
    </div>
  );
}
