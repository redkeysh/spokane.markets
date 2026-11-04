import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_VENDOR } from "@/lib/vendors/admin-input";

const mocks = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  revalidateAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  logAudit: vi.fn(),
  createNotification: vi.fn(),
  assertBadges: vi.fn(),
  uniqueSlug: vi.fn(),
  vendorFindUnique: vi.fn(),
  vendorCreate: vi.fn(),
  vendorUpdate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateAdmin: mocks.revalidateAdmin }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/notifications", () => ({ createNotification: mocks.createNotification }));
vi.mock("@/lib/listing-community-badges", () => ({ assertListingCommunityBadgeIds: mocks.assertBadges }));
vi.mock("@/lib/shared/slug", () => ({ generateUniqueVendorSlug: mocks.uniqueSlug }));
vi.mock("@/lib/db", () => ({
  db: {
    vendorProfile: { findUnique: mocks.vendorFindUnique, create: mocks.vendorCreate, update: mocks.vendorUpdate },
    user: { findUnique: mocks.userFindUnique },
  },
}));

import { archiveVendor, restoreVendor, saveVendor } from "./vendors";

const existing = {
  id: "v1",
  slug: "sunshine-farm",
  deletedAt: null,
  userId: "u1",
  verificationStatus: "UNVERIFIED" as const,
  businessName: "Sunshine Farm",
};

describe("saveVendor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.assertBadges.mockImplementation(async (ids: string[]) => ids);
    mocks.vendorCreate.mockResolvedValue({ id: "new-1", slug: "sunshine-farm" });
    mocks.vendorUpdate.mockResolvedValue({ id: "v1", slug: "sunshine-farm" });
  });

  it("refuses without an admin session", async () => {
    mocks.requireAdminAction.mockRejectedValue(new Error("Unauthorized"));
    await expect(saveVendor(null, { ...EMPTY_VENDOR, businessName: "A" })).rejects.toThrow("Unauthorized");
    expect(mocks.vendorCreate).not.toHaveBeenCalled();
  });

  it("returns field errors without writing", async () => {
    const result = await saveVendor(null, { ...EMPTY_VENDOR, businessName: "" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { businessName: "Add the business name." } });
    expect(mocks.vendorCreate).not.toHaveBeenCalled();
    expect(mocks.revalidateAdmin).not.toHaveBeenCalled();
  });

  it("creates a vendor with a web address made from the name", async () => {
    mocks.uniqueSlug.mockResolvedValue("sunshine-farm");
    const result = await saveVendor(null, { ...EMPTY_VENDOR, businessName: "Sunshine Farm", websiteUrl: "sunshinefarm.com" });
    expect(result).toEqual({ ok: true, id: "new-1", slug: "sunshine-farm" });
    expect(mocks.uniqueSlug).toHaveBeenCalledWith("Sunshine Farm", undefined);
    expect(mocks.vendorCreate.mock.calls[0][0].data).toMatchObject({
      businessName: "Sunshine Farm",
      slug: "sunshine-farm",
      websiteUrl: "https://sunshinefarm.com",
      description: null,
      userId: null,
    });
    expect(mocks.logAudit).toHaveBeenCalledWith("admin-1", "CREATE_VENDOR", "VENDOR_PROFILE", "new-1", expect.anything());
    expect(mocks.revalidateAdmin).toHaveBeenCalledTimes(1);
  });

  it("keeps the current web address when the field is blank and clears emptied fields", async () => {
    mocks.vendorFindUnique.mockResolvedValueOnce(existing);
    mocks.userFindUnique.mockResolvedValue({ id: "u1", vendorProfile: { id: "v1" } });
    await saveVendor("v1", { ...EMPTY_VENDOR, businessName: "Sunshine Farm", userId: "u1" });
    expect(mocks.uniqueSlug).not.toHaveBeenCalled();
    const data = mocks.vendorUpdate.mock.calls[0][0].data;
    expect(data).toMatchObject({ slug: "sunshine-farm", description: null, contactEmail: null, userId: "u1" });
    expect(data.listingCommunityBadges).toEqual({ set: [] });
  });

  it("refuses a web address another vendor uses", async () => {
    mocks.vendorFindUnique.mockResolvedValueOnce(existing).mockResolvedValueOnce({ id: "other" });
    const result = await saveVendor("v1", { ...EMPTY_VENDOR, businessName: "Sunshine Farm", slug: "taken" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { slug: "Another vendor already uses spokane.markets/vendors/taken." } });
    expect(mocks.vendorUpdate).not.toHaveBeenCalled();
  });

  it("refuses an owner who already has another vendor profile", async () => {
    mocks.vendorFindUnique.mockResolvedValueOnce(existing);
    mocks.userFindUnique.mockResolvedValue({ id: "u2", vendorProfile: { id: "v9" } });
    const result = await saveVendor("v1", { ...EMPTY_VENDOR, businessName: "Sunshine Farm", userId: "u2" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { userId: "That account already has a vendor profile." } });
  });

  it("does not save an archived vendor", async () => {
    mocks.vendorFindUnique.mockResolvedValueOnce({ ...existing, deletedAt: new Date() });
    const result = await saveVendor("v1", { ...EMPTY_VENDOR, businessName: "Sunshine Farm" });
    expect(result.ok).toBe(false);
    expect(mocks.vendorUpdate).not.toHaveBeenCalled();
  });

  it("tells the owner once when the profile becomes verified", async () => {
    mocks.vendorFindUnique.mockResolvedValueOnce(existing);
    await saveVendor("v1", { ...EMPTY_VENDOR, businessName: "Sunshine Farm", userId: "u1", verificationStatus: "VERIFIED" });
    expect(mocks.createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "VENDOR_VERIFIED" }));

    vi.clearAllMocks();
    mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.assertBadges.mockImplementation(async (ids: string[]) => ids);
    mocks.vendorUpdate.mockResolvedValue({ id: "v1", slug: "sunshine-farm" });
    mocks.vendorFindUnique.mockResolvedValueOnce({ ...existing, verificationStatus: "VERIFIED" });
    await saveVendor("v1", { ...EMPTY_VENDOR, businessName: "Sunshine Farm", userId: "u1", verificationStatus: "VERIFIED" });
    expect(mocks.createNotification).not.toHaveBeenCalled();
  });
});

describe("archiveVendor and restoreVendor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin-1" } });
  });

  it("archives an active vendor and refreshes the admin", async () => {
    mocks.vendorFindUnique.mockResolvedValue({ businessName: "Sunshine Farm", slug: "sunshine-farm", deletedAt: null });
    expect(await archiveVendor("v1")).toEqual({ ok: true, businessName: "Sunshine Farm" });
    expect(mocks.vendorUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: { deletedAt: expect.any(Date) } });
    expect(mocks.logAudit).toHaveBeenCalledWith("admin-1", "SOFT_DELETE_VENDOR", "VENDOR_PROFILE", "v1", expect.anything());
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });

  it("restores an archived vendor", async () => {
    mocks.vendorFindUnique.mockResolvedValue({ businessName: "Sunshine Farm", slug: "sunshine-farm", deletedAt: new Date("2026-10-01") });
    expect(await restoreVendor("v1")).toEqual({ ok: true, businessName: "Sunshine Farm" });
    expect(mocks.vendorUpdate).toHaveBeenCalledWith({ where: { id: "v1" }, data: { deletedAt: null } });
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });

  it("reports a missing vendor", async () => {
    mocks.vendorFindUnique.mockResolvedValue(null);
    expect(await archiveVendor("nope")).toEqual({ ok: false, error: "This vendor no longer exists." });
    expect(mocks.vendorUpdate).not.toHaveBeenCalled();
  });
});
