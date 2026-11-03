import { createHash, randomBytes } from "node:crypto";
import type { ApiTokenAccess, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePermissionMatrix, type AdminPermissionKey } from "@/lib/admin/permissions";

export const API_TOKEN_PREFIX = "smk_";
const DISPLAY_PREFIX_LENGTH = 12;
/** lastUsedAt is written at most this often per token. */
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiToken(): { token: string; prefix: string; tokenHash: string } {
  const token = `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, prefix: token.slice(0, DISPLAY_PREFIX_LENGTH), tokenHash: hashApiToken(token) };
}

/** Stores only the hash. The returned plaintext token cannot be recovered later. */
export async function createApiToken(input: {
  userId: string;
  name: string;
  access: ApiTokenAccess;
  expiresInDays: number | null;
}) {
  const { token, prefix, tokenHash } = generateApiToken();
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;
  const record = await db.apiToken.create({
    data: { name: input.name, tokenHash, prefix, access: input.access, userId: input.userId, expiresAt },
    select: { id: true, name: true, prefix: true, access: true, expiresAt: true },
  });
  return { token, record };
}

export type TokenPrincipal = {
  tokenId: string;
  tokenName: string;
  access: ApiTokenAccess;
  user: { id: string; email: string; name: string | null; role: Role };
  permissions: AdminPermissionKey[];
};

export type TokenAuthResult =
  | { ok: true; principal: TokenPrincipal }
  | { ok: false; status: 401 | 403; message: string };

async function permissionsForRole(role: Role): Promise<AdminPermissionKey[]> {
  const row = await db.siteConfig.findUnique({
    where: { key: "admin_permissions_matrix" },
    select: { value: true },
  });
  const matrix = normalizePermissionMatrix(row?.value ? JSON.parse(row.value) : null);
  return matrix[role] ?? [];
}

/**
 * Resolves an `Authorization: Bearer smk_...` header to the token's owner. The
 * owner must still be an ACTIVE admin; the token carries the owner's current
 * permissions, limited further by its own READ/WRITE access.
 */
export async function authenticateApiToken(authorization: string | null): Promise<TokenAuthResult> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || !token.startsWith(API_TOKEN_PREFIX)) {
    return { ok: false, status: 401, message: "Missing or malformed bearer token." };
  }

  const record = await db.apiToken.findUnique({
    where: { tokenHash: hashApiToken(token) },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, accountStatus: true } },
    },
  });
  if (!record || record.revokedAt) {
    return { ok: false, status: 401, message: "Invalid or revoked token." };
  }
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    return { ok: false, status: 401, message: "Token expired." };
  }
  if (record.user.role !== "ADMIN" || record.user.accountStatus !== "ACTIVE") {
    return { ok: false, status: 403, message: "The token's owner is no longer an active admin." };
  }

  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS) {
    await db.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } });
  }

  return {
    ok: true,
    principal: {
      tokenId: record.id,
      tokenName: record.name,
      access: record.access,
      user: {
        id: record.user.id,
        email: record.user.email,
        name: record.user.name,
        role: record.user.role,
      },
      permissions: await permissionsForRole(record.user.role),
    },
  };
}
