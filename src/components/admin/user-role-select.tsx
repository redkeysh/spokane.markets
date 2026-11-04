"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Role } from "@prisma/client";
import { getApiErrorMessage } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { SelectInput } from "@/components/admin/rare/controls";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { ROLE_ORDER, ROLE_WORDS } from "@/components/admin/user-words";

interface UserRoleSelectProps {
  userId: string;
  currentRole: Role;
  id?: string;
  "aria-describedby"?: string;
  disabled?: boolean;
}

/** The role of one person. Making someone an admin asks first. */
export function UserRoleSelect({
  userId,
  currentRole,
  id,
  "aria-describedby": describedBy,
  disabled = false,
}: UserRoleSelectProps) {
  const router = useRouter();
  const announce = useAnnounce();
  const [confirmRole, setConfirmRole] = useState<Role | null>(null);
  const [saving, setSaving] = useState(false);

  async function applyRole(role: Role) {
    setSaving(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setSaving(false);
    if (res.ok) {
      const message = `Role changed to ${ROLE_WORDS[role].one}.`;
      toast.success(message);
      announce(message);
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(getApiErrorMessage(body, "Could not change the role."));
    }
    router.refresh();
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value as Role;
    if (role === currentRole) return;
    // The select follows currentRole, so it stays put until the change lands.
    if (role === "ADMIN") {
      setConfirmRole(role);
    } else {
      void applyRole(role);
    }
  }

  return (
    <>
      <SelectInput
        id={id}
        aria-describedby={describedBy}
        value={currentRole}
        onChange={handleChange}
        disabled={saving || disabled}
        aria-busy={saving || undefined}
        className="w-48"
      >
        {ROLE_ORDER.map((r) => (
          <option key={r} value={r}>
            {ROLE_WORDS[r].one}
          </option>
        ))}
      </SelectInput>
      <ConfirmDialog
        open={confirmRole !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmRole(null);
        }}
        title="Make this person an admin?"
        description="Admins can change anything here, including other people's access."
        confirmLabel="Make admin"
        variant="destructive"
        pending={saving}
        onConfirm={() => {
          const role = confirmRole;
          setConfirmRole(null);
          if (role) void applyRole(role);
        }}
      />
    </>
  );
}
