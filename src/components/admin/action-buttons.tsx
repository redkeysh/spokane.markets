"use client";

import { useState } from "react";
import { useTransition } from "react";
import type { AnalyticsParams } from "@/lib/analytics";
import { trackEvent } from "@/lib/analytics";
import { toast } from "sonner";
import { isNextControlFlowError } from "@/lib/api-client";
import { Recycle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  const Icon = iconName === "recycle" ? Recycle : Trash2;

  return (
    <>
      <Button
        type="button"
        variant={iconOnly ? "ghost" : "destructive"}
        size={iconOnly ? "icon" : "sm"}
        disabled={isPending}
        onClick={() => setOpen(true)}
        aria-label={title}
        className={iconOnly ? "h-8 w-8 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10" : undefined}
      >
        {iconOnly ? (
          <Icon className="h-4 w-4" />
        ) : (
          isPending ? pendingLabel : label
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirm} disabled={isPending}>
              {isPending ? pendingLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    <Button
      type="button"
      variant={variant}
      size="sm"
      disabled={isPending}
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
      {isPending ? "..." : label}
    </Button>
  );
}
