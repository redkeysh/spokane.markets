"use client";

import { AdminButton, AdminLinkButton } from "@/components/admin/kit/button";
import { Menu, type MenuItem } from "@/components/admin/kit/menu";
import type { ActionSpec } from "./decision-parts";

/** Above a decision opened on its own (phones, and page mode): the way back to the pile. */
export function PhoneBackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="-ml-1 mb-3 inline-flex h-11 items-center rounded-md px-1 text-sm font-medium text-lilac lg:[@media(min-height:600px)]:hidden"
    >
      Back to To do
    </button>
  );
}

function PhoneButton({ spec, className }: { spec: ActionSpec; className?: string }) {
  const variant = spec.variant ?? "outline";
  if (spec.href) {
    return (
      <AdminLinkButton href={spec.href} variant={variant} size="lg" className={className}>
        {spec.label}
      </AdminLinkButton>
    );
  }
  return (
    <AdminButton
      variant={variant}
      size="lg"
      className={className}
      onClick={spec.onClick}
      disabled={spec.disabled}
      busy={spec.busy}
      busyLabel={spec.busyLabel}
    >
      {spec.label}
    </AdminButton>
  );
}

/**
 * The phone decision's bottom bar, 64 px: Reject on the left, the primary action on the right under
 * the thumb, and the rest (Edit, Later, Different events) in More. No swipes, so nothing publishes
 * by accident. While it shows, the shell's --sm-bottom-bar-h takes its height (globals.css), so
 * toasts sit above it and the page leaves room for it.
 */
export function PhoneDecisionBar({
  primary,
  reject,
  more,
}: {
  primary?: ActionSpec;
  reject?: ActionSpec;
  more: ActionSpec[];
}) {
  const items: MenuItem[] = more.map((spec) => ({
    label: spec.label,
    href: spec.href,
    onSelect: spec.onClick,
    disabled: spec.disabled,
    danger: spec.variant === "danger-outline",
  }));
  return (
    <div
      data-decision-bar
      className="fixed inset-x-0 bottom-0 z-30 flex min-h-16 items-center gap-2 border-t border-seam bg-fog px-4 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] lg:hidden"
    >
      {reject && <PhoneButton spec={{ ...reject, variant: "danger-outline" }} className="h-12" />}
      {items.length > 0 && <Menu items={items} label="More" trigger="More" variant="outline" size="lg" placement="top-start" className="h-12" />}
      <span className="flex-1" />
      {primary && <PhoneButton spec={primary} className="h-12 min-w-0 shrink" />}
    </div>
  );
}
