"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { FormError } from "@/components/admin/rare/controls";
import { useAnnounce } from "@/components/admin/shell/live-region";

interface UserResetPasswordButtonProps {
  userId: string;
  userName: string | null;
  userEmail: string;
}

/** Emails the person a link to choose a new password, after a confirmation. */
export function UserResetPasswordButton({ userId, userName, userEmail }: UserResetPasswordButtonProps) {
  const router = useRouter();
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = userName || userEmail;

  async function send() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendPasswordReset: true }),
      });
      if (res.ok) {
        setOpen(false);
        const message = `Sent a password reset email to ${userEmail}.`;
        toast.success(message);
        announce(message);
        router.refresh();
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body.error?.message || "Could not send the email. Try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <AdminButton variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog">
        Send password reset
      </AdminButton>
      <AdminDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title="Send a password reset email?"
        description={`${displayName} gets an email at ${userEmail} with a link to choose a new password.`}
        footer={
          <>
            <AdminButton variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </AdminButton>
            <AdminButton variant="ink" onClick={send} busy={saving} busyLabel="Sending">
              Send email
            </AdminButton>
          </>
        }
      >
        <FormError>{error}</FormError>
      </AdminDialog>
    </>
  );
}
