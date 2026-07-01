"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import type { Role } from "@prisma/client";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-client";

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

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value as Role;
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      router.refresh();
      toast.success("Role updated.");
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(getApiErrorMessage(body, "Failed to update role."));
      router.refresh();
    }
  }

  return (
    <Select
      value={currentRole}
      onChange={handleChange}
      className="w-32"
    >
      {ROLES.map((r) => (
        <option key={r.value} value={r.value}>
          {r.label}
        </option>
      ))}
    </Select>
  );
}
