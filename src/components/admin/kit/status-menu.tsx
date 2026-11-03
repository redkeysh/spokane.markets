"use client";

import { Menu } from "./menu";
import type { AdminButtonSize, AdminButtonVariant } from "./button";

export type EventStatusValue = "PUBLISHED" | "PENDING" | "DRAFT" | "CANCELLED" | "REJECTED";

/** Each status with its one consequence line. Archive is separate, in the More menu. */
export const EVENT_STATUS_OPTIONS: ReadonlyArray<{
  value: EventStatusValue;
  label: string;
  description: string;
}> = [
  { value: "PUBLISHED", label: "Published", description: "On the site." },
  { value: "PENDING", label: "Pending", description: "Waiting for your review. Not on the site." },
  { value: "DRAFT", label: "Draft", description: "Hidden while you prepare it." },
  { value: "CANCELLED", label: "Cancelled", description: "Not happening. Hidden from the site." },
  { value: "REJECTED", label: "Rejected", description: "Not a fit. The organizer is told, if there is one." },
];

/** The "Change" button next to the status sentence in the editor action bar. */
export function StatusMenu({
  value,
  onChange,
  options = EVENT_STATUS_OPTIONS,
  triggerLabel = "Change",
  variant = "quiet",
  size = "sm",
}: {
  value: EventStatusValue;
  onChange: (value: EventStatusValue) => void;
  options?: typeof EVENT_STATUS_OPTIONS;
  triggerLabel?: string;
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
}) {
  return (
    <Menu
      label="Change status"
      trigger={triggerLabel}
      variant={variant}
      size={size}
      placement="top-start"
      items={options.map((option) => ({
        label: option.label,
        description: option.description,
        checked: option.value === value,
        onSelect: () => onChange(option.value),
      }))}
    />
  );
}
