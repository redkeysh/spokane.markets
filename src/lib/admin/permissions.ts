import type { Role } from "@prisma/client";

export const ADMIN_PERMISSION_KEYS = [
  "admin.users.manage",
  "admin.roles.manage",
  "admin.moderation.manage",
  "admin.listings.manage",
  "admin.settings.manage",
  "admin.audit.read",
  "admin.analytics.read",
  "admin.system.read",
  "admin.marketing.manage",
] as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_KEYS)[number];

export type AdminPermissionMatrix = Record<Role, AdminPermissionKey[]>;

export const DEFAULT_ADMIN_PERMISSION_MATRIX: AdminPermissionMatrix = {
  USER: [],
  VENDOR: [],
  ORGANIZER: [],
  ADMIN: [...ADMIN_PERMISSION_KEYS],
};

const KNOWN_ROLES: Role[] = ["USER", "VENDOR", "ORGANIZER", "ADMIN"];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && KNOWN_ROLES.includes(value as Role);
}

export function normalizePermissionMatrix(
  raw: unknown
): AdminPermissionMatrix {
  const fallback = DEFAULT_ADMIN_PERMISSION_MATRIX;
  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as Partial<Record<Role, unknown>>;
  const roles: Role[] = KNOWN_ROLES;
  const matrix = {} as AdminPermissionMatrix;
  for (const role of roles) {
    const values = Array.isArray(candidate[role]) ? candidate[role] : [];
    matrix[role] = values.filter((v): v is AdminPermissionKey =>
      typeof v === "string" && ADMIN_PERMISSION_KEYS.includes(v as AdminPermissionKey)
    );
  }
  // ADMIN always retains every permission. Enforcing it here means a saved
  // matrix (even a crafted request) can never strip admins of roles.manage and
  // lock everyone out of the admin surface.
  matrix.ADMIN = [...ADMIN_PERMISSION_KEYS];
  return matrix;
}

