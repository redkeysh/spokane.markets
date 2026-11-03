"use client";

import { useState } from "react";
import { useTransition } from "react";
import type { AnalyticsParams } from "@/lib/analytics";
import { trackEvent } from "@/lib/analytics";
import { toast } from "sonner";
import { isNextControlFlowError } from "@/lib/api-client";
import { Archive, Trash2 } from "lucide-react";
import { AdminButton } from "@/components/admin/kit/button";
import { Tooltip } from "@/components/admin/kit/tooltip";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

export function DeleteButton({
  action,
  label = "Delete",
  title = "Delete",
  description = "Are you sure? This action cannot be undone.",
  confirmLabel = "Delete",
  pendingLabel = "Deleting...",
  iconOnly = false,
  iconName = "trash",
  successMessage = "Done.",
  errorMessage = "Something went wrong.",
}: {
  action: () => Promise<void>;
  label?: string;
  title?: string;
  description?: string;
  confirmLabel?: string;
  pendingLabel?: string;
  iconOnly?: boolean;
  iconName?: "trash" | "recycle";
  successMessage?: string;
  errorMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await action();
        setOpen(false);
        toast.success(successMessage);
      } catch (err) {
        if (isNextControlFlowError(err)) throw err;
        toast.error(err instanceof Error ? err.message : errorMessage);
      }
    });
  }

  // "recycle" is the soft, restorable archive.
  const Icon = iconName === "recycle" ? Archive : Trash2;

  const trigger = (
    <AdminButton
      variant={iconOnly ? "quiet" : "danger-outline"}
      size={iconOnly ? "icon-sm" : "sm"}
      busy={isPending}
      busyLabel={iconOnly ? undefined : pendingLabel}
      onClick={() => setOpen(true)}
      aria-label={iconOnly ? title : undefined}
      className={iconOnly && iconName === "trash" ? "text-ponderosa hover:text-ponderosa" : undefined}
    >
      {iconOnly ? <Icon strokeWidth={1.75} aria-hidden="true" /> : label}
    </AdminButton>
  );

  return (
    <>
      {iconOnly ? <Tooltip content={title}>{trigger}</Tooltip> : trigger}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={isPending ? pendingLabel : confirmLabel}
        variant="destructive"
        pending={isPending}
        onConfirm={handleConfirm}
      />
    </>
  );
}

export function StatusButton({
  action,
  label,
  variant = "default",
  onSuccess,
  analyticsEventName,
  analyticsParams,
  successMessage = "Done.",
  errorMessage = "Something went wrong.",
}: {
  action: () => Promise<unknown>;
  label: string;
  variant?: "default" | "destructive" | "outline";
  onSuccess?: () => void;
  analyticsEventName?: string;
  analyticsParams?: AnalyticsParams;
  successMessage?: string;
  errorMessage?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <AdminButton
      variant={variant === "default" ? "ink" : variant === "destructive" ? "danger-outline" : "outline"}
      size="sm"
      busy={isPending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await action();
            if (
              result &&
              typeof result === "object" &&
              "ok" in result &&
              (result as { ok?: unknown }).ok === false
            ) {
              const msg = (result as { error?: unknown }).error;
              toast.error(typeof msg === "string" ? msg : errorMessage);
              return;
            }
            if (analyticsEventName) {
              trackEvent(analyticsEventName, analyticsParams);
            }
            onSuccess?.();
            toast.success(successMessage);
          } catch (err) {
            if (isNextControlFlowError(err)) throw err;
            toast.error(err instanceof Error ? err.message : errorMessage);
          }
        })
      }
    >
      {label}
    </AdminButton>
  );
}
