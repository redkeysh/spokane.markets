import { beforeEach, describe, expect, it, vi } from "vitest";

const { vendorFindUnique } = vi.hoisted(() => ({ vendorFindUnique: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: { vendorProfile: { findUnique: vendorFindUnique } } }));

import { generateUniqueVendorSlug } from "./slug";

describe("generateUniqueVendorSlug", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("looks slugs up across every vendor, archived ones included", async () => {
    vendorFindUnique.mockResolvedValueOnce({ id: "archived-vendor" }).mockResolvedValueOnce(null);
    expect(await generateUniqueVendorSlug("Rose Farm")).toBe("rose-farm-1");
    expect(vendorFindUnique).toHaveBeenCalledWith({ where: { slug: "rose-farm" }, select: { id: true } });
  });

  it("keeps a vendor's own slug when renaming", async () => {
    vendorFindUnique.mockResolvedValueOnce({ id: "v1" });
    expect(await generateUniqueVendorSlug("Rose Farm", "v1")).toBe("rose-farm");
  });
});
