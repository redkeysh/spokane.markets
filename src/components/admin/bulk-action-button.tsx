"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

type BulkActionButtonProps = {
  label: string;
  confirmMessage: string;
  className?: string;
  formAction: (formData: FormData) => void | Promise<void>;
};

export function BulkActionButton({
  label,
  confirmMessage,
  className,
  formAction,
}: BulkActionButtonProps) {
  const [open, setOpen] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* Hidden real submit button carrying the server action; the visible
          trigger opens a ConfirmDialog and submits the form on confirm. */}
      <button
        ref={submitRef}
        type="submit"
        formAction={formAction}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Confirm bulk action"
        description={confirmMessage}
        onConfirm={() => {
          setOpen(false);
          const btn = submitRef.current;
          btn?.form?.requestSubmit(btn);
        }}
      />
    </>
  );
}
