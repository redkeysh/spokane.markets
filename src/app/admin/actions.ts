"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import {
  normalizePermissionMatrix,
  type AdminPermissionKey,
} from "@/lib/admin/permissions";
import { createApiToken } from "@/lib/api-tokens";

async function requireAdminAction(permission: AdminPermissionKey) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (
    !session?.user ||
    session.user.role !== "ADMIN" ||
    session.user.accountStatus !== "ACTIVE"
  ) {
    throw new Error("Unauthorized");
  }
  const row = await db.siteConfig.findUnique({
    where: { key: "admin_permissions_matrix" },
    select: { value: true },
  });
  const matrix = normalizePermissionMatrix(
    row?.value ? JSON.parse(row.value) : null
  );
  const allowed = matrix[session.user.role]?.includes(permission) ?? false;
  if (!allowed) {
    throw new Error("Forbidden");
  }
  return session;
}

const createApiTokenSchema = z.object({
  name: z.string().trim().min(1, "Give the token a name.").max(80),
  access: z.enum(["READ", "WRITE"]),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable(),
});

/** Returns the plaintext token once; only its hash is stored. */
export async function createApiTokenAction(
  input: z.input<typeof createApiTokenSchema>
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const session = await requireAdminAction("admin.settings.manage");
  const parsed = createApiTokenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid token settings." };
  }
  const { token, record } = await createApiToken({ userId: session.user.id, ...parsed.data });
  await logAudit(session.user.id, "CREATE_API_TOKEN", "API_TOKEN", record.id, {
    name: record.name,
    access: record.access,
    expiresAt: record.expiresAt,
  });
  revalidatePath("/admin/api-tokens");
  return { ok: true, token };
}

export async function revokeApiTokenAction(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAdminAction("admin.settings.manage");
  const existing = await db.apiToken.findUnique({ where: { id }, select: { name: true, revokedAt: true } });
  if (!existing) return { ok: false, error: "Token not found." };
  if (!existing.revokedAt) {
    await db.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    await logAudit(session.user.id, "REVOKE_API_TOKEN", "API_TOKEN", id, { name: existing.name });
  }
  revalidatePath("/admin/api-tokens");
  return { ok: true };
}

export async function deletePromotion(id: string) {
  const session = await requireAdminAction("admin.listings.manage");
  await db.promotion.delete({ where: { id } });
  await logAudit(session.user.id, "DELETE_PROMOTION", "PROMOTION", id);
  revalidatePath("/admin/promotions");
  revalidatePath("/");
  revalidatePath("/vendors");
}
