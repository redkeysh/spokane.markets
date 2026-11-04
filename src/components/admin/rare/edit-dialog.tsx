"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { FormError } from "./controls";

export type EditDialogRemove = {
  /** The button in the form step, e.g. "Delete badge". */
  label: string;
  /** The question of the confirm step, e.g. "Delete Women-owned?". */
  title: string;
  description: string;
  /** The destructive button of the confirm step. */
  confirmLabel: string;
  busyLabel: string;
  run: () => void | Promise<void>;
};

/**
 * A form in a dialog with Cancel and one ink Save. With `remove`, the form step also offers a
 * destructive action that first turns the same dialog into a confirm step; focus moves to the
 * safe choice there, and back to the destructive button when the owner steps back.
 */
export function EditDialog({
  open,
  onOpenChange,
  title,
  description,
  formId,
  onSubmit,
  saveLabel = "Save",
  saving = false,
  error,
  remove,
  removing = false,
  children,
  size = "list",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  formId: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saveLabel?: string;
  saving?: boolean;
  error?: string | null;
  remove?: EditDialogRemove;
  removing?: boolean;
  children: React.ReactNode;
  size?: "confirm" | "list";
}) {
  const [asking, setAsking] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  const keepRef = React.useRef<HTMLButtonElement>(null);
  const removeRef = React.useRef<HTMLButtonElement>(null);
  const backFromConfirm = React.useRef(false);

  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setAsking(false);
  }

  React.useEffect(() => {
    if (asking) {
      keepRef.current?.focus();
    } else if (backFromConfirm.current) {
      backFromConfirm.current = false;
      removeRef.current?.focus();
    }
  }, [asking]);

  const confirming = asking && remove !== undefined;

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      size={confirming ? "confirm" : size}
      title={confirming ? remove.title : title}
      description={confirming ? remove.description : description}
      footer={
        confirming ? (
          <>
            <AdminButton
              ref={keepRef}
              variant="outline"
              onClick={() => {
                backFromConfirm.current = true;
                setAsking(false);
              }}
              disabled={removing}
            >
              Go back
            </AdminButton>
            <AdminButton variant="danger" onClick={() => void remove.run()} busy={removing} busyLabel={remove.busyLabel}>
              {remove.confirmLabel}
            </AdminButton>
          </>
        ) : (
          <>
            {remove && (
              <AdminButton
                ref={removeRef}
                variant="danger-outline"
                className="w-full sm:mr-auto sm:w-auto"
                onClick={() => setAsking(true)}
              >
                {remove.label}
              </AdminButton>
            )}
            <AdminButton variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </AdminButton>
            <AdminButton type="submit" form={formId} variant="ink" busy={saving} busyLabel="Saving">
              {saveLabel}
            </AdminButton>
          </>
        )
      }
    >
      {confirming ? (
        <FormError>{error}</FormError>
      ) : (
        <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4 pb-2">
          {children}
          <FormError>{error}</FormError>
        </form>
      )}
    </AdminDialog>
  );
}
