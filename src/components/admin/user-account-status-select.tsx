"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-client";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

const ACCOUNT_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "BANNED", label: "Banned" },
  { value: "DEACTIVATED", label: "Deactivated" },
] as const;

type AccountStatus = (typeof ACCOUNT_STATUSES)[number]["value"];

const STATUS_LABEL: Record<AccountStatus, string> = Object.fromEntries(
  ACCOUNT_STATUSES.map((s) => [s.value, s.label])
) as Record<AccountStatus, string>;

// Statuses that block or restrict sign-in warrant a confirmation step.
const HIGH_IMPACT: AccountStatus[] = ["SUSPENDED", "BANNED", "DEACTIVATED"];

interface UserAccountStatusSelectProps {
  userId: string;
  currentStatus: AccountStatus;
}

export function UserAccountStatusSelect({
  userId,
  currentStatus,
}: UserAccountStatusSelectProps) {
  const router = useRouter();
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
      toast.success("Account status updated.");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(getApiErrorMessage(body, "Failed to update account status."));
      router.refresh();
    }
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
      <Select value={currentStatus} onChange={handleChange} disabled={saving} className="w-36">
        {ACCOUNT_STATUSES.map((status) => (
          <option key={status.value} value={status.value}>
            {status.label}
          </option>
        ))}
      </Select>
      <ConfirmDialog
        open={confirmStatus !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmStatus(null);
        }}
        title="Change account status?"
        description={`This sets the account to "${
          confirmStatus ? STATUS_LABEL[confirmStatus] : ""
        }" and can block the user from signing in.`}
        confirmLabel="Update status"
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
