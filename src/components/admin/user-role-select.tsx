"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-client";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import type { Role } from "@prisma/client";

const ROLES: { value: Role; label: string }[] = [
  { value: "USER", label: "User" },
  { value: "VENDOR", label: "Vendor" },
  { value: "ORGANIZER", label: "Organizer" },
  { value: "ADMIN", label: "Admin" },
];

interface UserRoleSelectProps {
  userId: string;
  currentRole: Role;
}

export function UserRoleSelect({ userId, currentRole }: UserRoleSelectProps) {
  const router = useRouter();
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
      toast.success("Role updated.");
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(getApiErrorMessage(body, "Failed to update role."));
      router.refresh();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value as Role;
    if (role === currentRole) return;
    // Promotion to ADMIN grants full access, so confirm it first. The select is
    // controlled by currentRole, so it visually stays put until the change lands.
    if (role === "ADMIN") {
      setConfirmRole(role);
    } else {
      void applyRole(role);
    }
  }

  return (
    <>
      <Select value={currentRole} onChange={handleChange} disabled={saving} className="w-32">
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <ConfirmDialog
        open={confirmRole !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmRole(null);
        }}
        title="Grant administrator access?"
        description="This gives the account full admin access to every part of the site."
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
