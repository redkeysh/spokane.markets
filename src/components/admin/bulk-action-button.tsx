"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adminButtonClass } from "@/components/admin/kit/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

type BulkActionResult = void | { ok: true; message: string } | { ok: false; error: string };

type BulkActionButtonProps = {
  label: string;
  confirmMessage: string;
  className?: string;
  formAction: (formData: FormData) => Promise<BulkActionResult>;
};

/**
 * Confirms, then runs the server action with the enclosing form's data. A
 * returned result is shown as a toast; a thrown error is shown as a toast too,
 * since production builds replace thrown server messages with a generic one.
 */
export function BulkActionButton({
  label,
  confirmMessage,
  className,
  formAction,
}: BulkActionButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function run() {
    const form = triggerRef.current?.form;
    if (!form) return;
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await formAction(formData);
        if (!result) return;
        if (result.ok) toast.success(result.message);
        else toast.error(result.error);
      } catch {
        toast.error("The bulk action failed. Refresh the page to see what changed.");
      } finally {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(adminButtonClass({ variant: "outline", size: "sm" }), className)}
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Confirm bulk action"
        description={confirmMessage}
        pending={pending}
        onConfirm={run}
      />
    </>
  );
}
