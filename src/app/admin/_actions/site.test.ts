import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminAction: vi.fn(),
  revalidateAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  logAudit: vi.fn(),
  transaction: vi.fn(),
  configUpsert: vi.fn(),
  configDeleteMany: vi.fn(),
  configFindUnique: vi.fn(),
  stateFindUnique: vi.fn(),
  stateUpsert: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
  unstable_cache: <T>(fn: T) => fn,
}));
vi.mock("@/lib/admin/auth-action", () => ({ requireAdminAction: mocks.requireAdminAction }));
vi.mock("@/lib/admin/revalidate", () => ({ revalidateAdmin: mocks.revalidateAdmin }));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    siteConfig: { upsert: mocks.configUpsert, deleteMany: mocks.configDeleteMany, findUnique: mocks.configFindUnique },
    siteState: { findUnique: mocks.stateFindUnique, upsert: mocks.stateUpsert },
  },
}));
vi.mock("@/lib/site-theme", () => ({ SITE_THEME_CACHE_TAG: "site-config:theme" }));

import { resetBanner, saveAnnouncement, saveMaintenance, saveSitePalette, setBannerFocus, setBannerImage } from "./site";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdminAction.mockResolvedValue({ user: { id: "admin-1" } });
  mocks.configUpsert.mockImplementation((args: { where: { key: string }; update: { value: string } }) => ({ upsert: args.where.key, value: args.update.value }));
  mocks.configDeleteMany.mockImplementation((args: unknown) => ({ deleteMany: args }));
  mocks.transaction.mockResolvedValue([]);
});

describe("saveAnnouncement", () => {
  it("refuses without an admin session", async () => {
    mocks.requireAdminAction.mockRejectedValue(new Error("Unauthorized"));
    await expect(saveAnnouncement({ enabled: false, text: "", linkLabel: "", linkUrl: "" })).rejects.toThrow("Unauthorized");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns the field error and writes nothing", async () => {
    const result = await saveAnnouncement({ enabled: true, text: "", linkLabel: "", linkUrl: "" });
    expect(result).toEqual({ ok: false, error: "Write a message, or turn the bar off.", fieldErrors: { text: "Write a message, or turn the bar off." } });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.revalidateAdmin).not.toHaveBeenCalled();
  });

  it("saves the four settings, refreshes the public cache and the admin", async () => {
    const result = await saveAnnouncement({ enabled: true, text: " Vendor applications are open ", linkLabel: "Apply", linkUrl: "/submit" });
    expect(result).toEqual({ ok: true });
    expect(mocks.transaction.mock.calls[0][0]).toEqual([
      { upsert: "site_announcement_enabled", value: "true" },
      { upsert: "site_announcement_text", value: "Vendor applications are open" },
      { upsert: "site_announcement_link_label", value: "Apply" },
      { upsert: "site_announcement_link_url", value: "/submit" },
    ]);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("site-config:announcement", "max");
    expect(mocks.revalidateAdmin).toHaveBeenCalledTimes(1);
  });
});

describe("saveSitePalette", () => {
  it("saves a known palette", async () => {
    mocks.configFindUnique.mockResolvedValue({ value: "cedar" });
    expect(await saveSitePalette("clay")).toEqual({ ok: true });
    expect(mocks.configUpsert).toHaveBeenCalledWith({ where: { key: "site_theme" }, create: { key: "site_theme", value: "clay" }, update: { value: "clay" } });
    expect(mocks.revalidateTag).toHaveBeenCalledWith("site-config:theme", "max");
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });

  it("refuses an unknown palette", async () => {
    expect(await saveSitePalette("neon" as never)).toEqual({ ok: false, error: "Pick one of the palettes." });
    expect(mocks.configUpsert).not.toHaveBeenCalled();
  });
});

describe("saveMaintenance", () => {
  it("stores the mode, drops blank links and reads the return time in Pacific time", async () => {
    mocks.stateFindUnique.mockResolvedValue({ mode: "OFF" });
    const result = await saveMaintenance({
      mode: "MAINTENANCE_ADMIN_ONLY",
      messageTitle: "",
      messageBody: "  ",
      links: [{ label: "", url: "" }, { label: "Status", url: "/status" }],
      eta: "2026-11-07T09:30",
    });
    expect(result).toEqual({ ok: true });
    const update = mocks.stateUpsert.mock.calls[0][0].update;
    expect(update).toMatchObject({
      mode: "MAINTENANCE_ADMIN_ONLY",
      messageTitle: "We'll be right back",
      messageBody: null,
      links: [{ label: "Status", url: "/status" }],
      updatedByUserId: "admin-1",
    });
    expect(update.eta.toISOString()).toBe("2026-11-07T17:30:00.000Z");
    expect(mocks.logAudit).toHaveBeenCalledWith("admin-1", "UPDATE_MAINTENANCE_MODE", "SITE_STATE", "default", expect.anything());
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });

  it("refuses an unreadable return time", async () => {
    const result = await saveMaintenance({ mode: "OFF", messageTitle: "", messageBody: "", links: [], eta: "soon" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { eta: "Pick a date and time for the return." } });
    expect(mocks.stateUpsert).not.toHaveBeenCalled();
  });
});

describe("banners", () => {
  it("sets a new picture and recenters it", async () => {
    expect(await setBannerImage("produce", "/uploads/banners/a.webp")).toEqual({ ok: true });
    expect(mocks.transaction.mock.calls[0][0]).toEqual([
      { upsert: "produce", value: "/uploads/banners/a.webp" },
      { deleteMany: { where: { key: { in: ["produceFocalX", "produceFocalY"] } } } },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/about");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/auth", "layout");
    expect(mocks.revalidateAdmin).toHaveBeenCalled();
  });

  it("refuses a link that is not a picture link", async () => {
    expect(await setBannerImage("hero", "javascript:alert(1)")).toEqual({ ok: false, error: "That is not a picture link." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("saves a focal point and refuses one outside the picture", async () => {
    expect(await setBannerFocus("hero", { x: 30, y: 70 })).toEqual({ ok: true });
    expect(mocks.transaction.mock.calls[0][0]).toEqual([
      { upsert: "heroFocalX", value: "30" },
      { upsert: "heroFocalY", value: "70" },
    ]);
    expect(await setBannerFocus("hero", { x: 130, y: 0 })).toMatchObject({ ok: false });
  });

  it("resets a banner to the built-in picture", async () => {
    expect(await resetBanner("events")).toEqual({ ok: true });
    expect(mocks.configDeleteMany).toHaveBeenCalledWith({ where: { key: { in: ["events", "eventsFocalX", "eventsFocalY"] } } });
  });

  it("refuses an unknown banner", async () => {
    expect(await resetBanner("sidebar" as never)).toEqual({ ok: false, error: "That banner does not exist." });
  });
});
