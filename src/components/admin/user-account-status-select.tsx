"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AccountStatus } from "@prisma/client";
import { getApiErrorMessage } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { SelectInput } from "@/components/admin/rare/controls";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { STATUS_ORDER, STATUS_WORDS } from "@/components/admin/user-words";

/** Statuses that stop or limit sign-in ask first. */
const HIGH_IMPACT: readonly AccountStatus[] = ["SUSPENDED", "BANNED", "DEACTIVATED"];

interface UserAccountStatusSelectProps {
  userId: string;
  currentStatus: AccountStatus;
  id?: string;
  "aria-describedby"?: string;
  disabled?: boolean;
}

/** Whether one person can sign in. */
export function UserAccountStatusSelect({
  userId,
  currentStatus,
  id,
  "aria-describedby": describedBy,
  disabled = false,
}: UserAccountStatusSelectProps) {
  const router = useRouter();
  const announce = useAnnounce();
  const [confirmStatus, setConfirmStatus] = useState<AccountStatus | null>(null);
  const [saving, setSaving] = useState(false);

  async function applyStatus(accountStatus: AccountStatus) {
    setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountStatus }),
    });
    setSaving(false);
    if (res.ok) {
      const message = `Account set to ${STATUS_WORDS[accountStatus].toLowerCase()}.`;
      toast.success(message);
      announce(message);
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(getApiErrorMessage(body, "Could not change the account."));
    }
    router.refresh();
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value as AccountStatus;
    if (status === currentStatus) return;
    if (HIGH_IMPACT.includes(status)) {
      setConfirmStatus(status);
    } else {
      void applyStatus(status);
    }
  }

  return (
    <>
      <SelectInput
        id={id}
        aria-describedby={describedBy}
        value={currentStatus}
        onChange={handleChange}
        disabled={saving || disabled}
        aria-busy={saving || undefined}
        className="w-48"
      >
        {STATUS_ORDER.map((status) => (
          <option key={status} value={status}>
            {STATUS_WORDS[status]}
          </option>
        ))}
      </SelectInput>
      <ConfirmDialog
        open={confirmStatus !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmStatus(null);
        }}
        title={`Set this account to ${confirmStatus ? STATUS_WORDS[confirmStatus].toLowerCase() : "this"}?`}
        description="This can stop them from signing in. You can set the account back to active later."
        confirmLabel={confirmStatus ? `Set to ${STATUS_WORDS[confirmStatus].toLowerCase()}` : "Change"}
        variant="destructive"
        pending={saving}
        onConfirm={() => {
          const status = confirmStatus;
          setConfirmStatus(null);
          if (status) void applyStatus(status);
        }}
      />
    </>
  );
}
