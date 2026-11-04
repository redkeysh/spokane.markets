"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-client";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { FormError } from "@/components/admin/rare/controls";

interface UserDeleteButtonProps {
  userId: string;
  userName: string | null;
  userEmail: string;
  isCurrentUser: boolean;
  /** Where to go once the account is gone. */
  afterDelete?: string;
}

/** Deletes an account for good, after a confirmation. Nobody can delete their own account here. */
export function UserDeleteButton({ userId, userName, userEmail, isCurrentUser, afterDelete }: UserDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = userName || userEmail;

  async function handleDelete() {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        setOpen(false);
        toast.success(`Deleted the account of ${displayName}.`);
        if (afterDelete) router.push(afterDelete);
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(getApiErrorMessage(body, "Could not delete the account."));
      }
    } finally {
      setDeleting(false);
    }
  }

  if (isCurrentUser) {
    return null;
  }

  return (
    <>
      <AdminButton variant="danger-outline" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Delete account
      </AdminButton>
      <AdminDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title={`Delete the account of ${displayName}?`}
        description="Their account and everything tied to it is removed. This cannot be undone."
        footer={
          <>
            <AdminButton variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </AdminButton>
            <AdminButton variant="danger" onClick={handleDelete} busy={deleting} busyLabel="Deleting">
              Delete account
            </AdminButton>
          </>
        }
      >
        <FormError>{error}</FormError>
      </AdminDialog>
    </>
  );
}
