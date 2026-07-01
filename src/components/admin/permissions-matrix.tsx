"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  ADMIN_PERMISSION_KEYS,
  type AdminPermissionMatrix,
  type AdminPermissionKey,
} from "@/lib/admin/permissions";

const ROLES = ["USER", "VENDOR", "ORGANIZER", "ADMIN"] as const;

type Role = (typeof ROLES)[number];

const LABELS: Record<AdminPermissionKey, string> = {
  "admin.users.manage": "Manage users",
  "admin.roles.manage": "Manage roles",
  "admin.moderation.manage": "Moderate content",
  "admin.listings.manage": "Manage listings",
  "admin.settings.manage": "Manage settings",
  "admin.audit.read": "View audit log",
  "admin.analytics.read": "View analytics",
  "admin.system.read": "View system health",
  "admin.marketing.manage": "Manage marketing studio",
};

export function PermissionsMatrix({
  initialMatrix,
}: {
  initialMatrix: AdminPermissionMatrix;
}) {
  const [matrix, setMatrix] = useState<AdminPermissionMatrix>(initialMatrix);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const roleSets = useMemo(
    () =>
      Object.fromEntries(
        ROLES.map((role) => [role, new Set(matrix[role])])
      ) as Record<Role, Set<AdminPermissionKey>>,
    [matrix]
  );

  function toggle(role: Role, permission: AdminPermissionKey) {
    setMatrix((prev) => {
      const nextSet = new Set(prev[role]);
      if (nextSet.has(permission)) nextSet.delete(permission);
      else nextSet.add(permission);
      return { ...prev, [role]: [...nextSet] };
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(matrix),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(getApiErrorMessage(body, "Failed to save permissions."));
        return;
      }
      toast.success("Permissions updated.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">Permission</th>
              {ROLES.map((role) => (
                <th key={role} className="px-3 py-2 text-left">
                  {role}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ADMIN_PERMISSION_KEYS.map((permission) => (
              <tr key={permission}>
                <td className="px-3 py-2">{LABELS[permission]}</td>
                {ROLES.map((role) => (
                  <td key={`${permission}-${role}`} className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={roleSets[role].has(permission)}
                      onChange={() => toggle(role, permission)}
                      disabled={role === "ADMIN"}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => setConfirmOpen(true)} disabled={saving}>
          {saving ? "Saving..." : "Save permission matrix"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Admin role always retains full permissions.
        </p>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Save permission changes?"
        description="This rewrites what every non-admin role can access across the entire admin. Make sure the changes are correct."
        confirmLabel="Save changes"
        pending={saving}
        onConfirm={() => {
          setConfirmOpen(false);
          void save();
        }}
      />
    </div>
  );
}

