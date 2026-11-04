"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { assertListingCommunityBadgeIds } from "@/lib/listing-community-badges";
import { createNotification } from "@/lib/notifications";
import { generateUniqueVendorSlug } from "@/lib/shared/slug";
import { requireAdminAction } from "@/lib/admin/auth-action";
import { revalidateAdmin } from "@/lib/admin/revalidate";
import { fieldErrorsOf, vendorEditorSchema, vendorWriteData, type VendorEditorInput } from "@/lib/vendors/admin-input";

export type VendorSaveResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type VendorArchiveResult = { ok: true; businessName: string } | { ok: false; error: string };

function revalidateVendorPages(slugs: Array<string | null | undefined>) {
  revalidatePath("/vendors");
  for (const slug of new Set(slugs)) if (slug) revalidatePath(`/vendors/${slug}`);
  revalidateAdmin();
}

function fail(error: string, field?: string): VendorSaveResult {
  return { ok: false, error, fieldErrors: field ? { [field]: error } : undefined };
}

/**
 * Creates the vendor when `id` is null, otherwise saves it. A blank web address keeps the
 * current one (or is made from the name on create). Verifying a claimed profile tells its owner.
 */
export async function saveVendor(id: string | null, input: VendorEditorInput): Promise<VendorSaveResult> {
  const session = await requireAdminAction();
  const parsed = vendorEditorSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? "Check the highlighted fields.", fieldErrors };
  }
  const data = parsed.data;

  const current = id
    ? await db.vendorProfile.findUnique({
        where: { id },
        select: { id: true, slug: true, deletedAt: true, userId: true, verificationStatus: true, businessName: true },
      })
    : null;
  if (id && !current) return fail("This vendor no longer exists.");
  if (current?.deletedAt) return fail("This vendor is archived. Restore it before making changes.");

  let badgeIds: string[];
  try {
    badgeIds = await assertListingCommunityBadgeIds(data.listingCommunityBadgeIds);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Those community badges do not exist.", "listingCommunityBadgeIds");
  }

  const wantedSlug = data.slug.trim();
  let slug: string;
  if (wantedSlug) {
    const taken = await db.vendorProfile.findUnique({ where: { slug: wantedSlug }, select: { id: true } });
    if (taken && taken.id !== id) return fail(`Another vendor already uses spokane.markets/vendors/${wantedSlug}.`, "slug");
    slug = wantedSlug;
  } else {
    slug = current?.slug ?? (await generateUniqueVendorSlug(data.businessName, id ?? undefined));
  }

  const userId = data.userId?.trim() || null;
  if (userId && userId !== current?.userId) {
    const owner = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, vendorProfile: { select: { id: true } } },
    });
    if (!owner) return fail("That account no longer exists.", "userId");
    if (owner.vendorProfile && owner.vendorProfile.id !== id) return fail("That account already has a vendor profile.", "userId");
  }

  const columns = { ...vendorWriteData(data), slug, userId };
  let saved: { id: string; slug: string };
  if (current) {
    saved = await db.vendorProfile.update({
      where: { id: current.id },
      data: { ...columns, listingCommunityBadges: { set: badgeIds.map((badgeId) => ({ id: badgeId })) } },
      select: { id: true, slug: true },
    });
    await logAudit(session.user.id, "UPDATE_VENDOR", "VENDOR_PROFILE", saved.id, {
      previousValue: { businessName: current.businessName, slug: current.slug, verificationStatus: current.verificationStatus, userId: current.userId },
      newValue: { businessName: columns.businessName, slug, verificationStatus: columns.verificationStatus, userId },
      details: { title: columns.businessName },
    });
  } else {
    saved = await db.vendorProfile.create({
      data: { ...columns, listingCommunityBadges: { connect: badgeIds.map((badgeId) => ({ id: badgeId })) } },
      select: { id: true, slug: true },
    });
    await logAudit(session.user.id, "CREATE_VENDOR", "VENDOR_PROFILE", saved.id, {
      newValue: { businessName: columns.businessName, slug },
      details: { title: columns.businessName },
    });
  }

  const nowVerified = columns.verificationStatus === "VERIFIED" && current?.verificationStatus !== "VERIFIED";
  if (nowVerified && userId) {
    await createNotification({
      userId,
      type: "VENDOR_VERIFIED",
      title: `Your vendor profile ${columns.businessName} is now verified`,
      link: `/vendors/${saved.slug}`,
      objectType: "vendor_profile",
      objectId: saved.id,
    });
  }

  revalidateVendorPages([current?.slug, saved.slug]);
  revalidatePath("/dashboard");
  return { ok: true, id: saved.id, slug: saved.slug };
}

/** Takes the profile off the site and out of every list. Restorable. */
export async function archiveVendor(id: string): Promise<VendorArchiveResult> {
  const session = await requireAdminAction();
  const current = await db.vendorProfile.findUnique({ where: { id }, select: { businessName: true, slug: true, deletedAt: true } });
  if (!current) return { ok: false, error: "This vendor no longer exists." };
  if (!current.deletedAt) {
    await db.vendorProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAudit(session.user.id, "SOFT_DELETE_VENDOR", "VENDOR_PROFILE", id, {
      previousValue: { deletedAt: null },
      newValue: { deletedAt: "now" },
      details: { title: current.businessName },
    });
  }
  revalidateVendorPages([current.slug]);
  return { ok: true, businessName: current.businessName };
}

export async function restoreVendor(id: string): Promise<VendorArchiveResult> {
  const session = await requireAdminAction();
  const current = await db.vendorProfile.findUnique({ where: { id }, select: { businessName: true, slug: true, deletedAt: true } });
  if (!current) return { ok: false, error: "This vendor no longer exists." };
  if (current.deletedAt) {
    await db.vendorProfile.update({ where: { id }, data: { deletedAt: null } });
    await logAudit(session.user.id, "RESTORE_VENDOR", "VENDOR_PROFILE", id, {
      previousValue: { deletedAt: current.deletedAt.toISOString() },
      newValue: { deletedAt: null },
      details: { title: current.businessName },
    });
  }
  revalidateVendorPages([current.slug]);
  return { ok: true, businessName: current.businessName };
}
