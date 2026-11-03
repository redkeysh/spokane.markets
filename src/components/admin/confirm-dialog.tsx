"use client";

import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";

/**
 * Shared confirmation dialog for destructive or high-impact actions, on the native AdminDialog.
 * Use this instead of window.confirm so every confirmation across the admin looks and behaves
 * the same. Controlled via `open` / `onOpenChange`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <AdminButton variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </AdminButton>
          <AdminButton
            variant={variant === "destructive" ? "danger" : "ink"}
            onClick={onConfirm}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            {confirmLabel}
          </AdminButton>
        </>
      }
    />
  );
}
