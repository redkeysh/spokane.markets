import { describe, expect, it } from "vitest";
import {
  countEventsByVendor,
  eventsAtLabel,
  parseVendorListParams,
  topCategories,
  vendorCountSentence,
  vendorEmptyMessage,
  safeVendorListBack,
  vendorExport,
  vendorListHref,
  vendorListWhere,
  vendorPageHref,
  verificationMarkStatus,
} from "./admin-list";

describe("parseVendorListParams", () => {
  it("defaults to every active vendor on page 1", () => {
    expect(parseVendorListParams({})).toEqual({ q: "", show: "all", page: 1 });
  });

  it("reads the show scope, search and page", () => {
    expect(parseVendorListParams({ q: "  honey ", show: "waiting", page: "3" })).toEqual({ q: "honey", show: "waiting", page: 3 });
  });

  it("ignores an unknown scope and a bad page", () => {
    expect(parseVendorListParams({ show: "VERIFIED", page: "-2" })).toEqual({ q: "", show: "all", page: 1 });
  });

  it("maps the old orphaned and archived flags", () => {
    expect(parseVendorListParams({ orphaned: "1" }).show).toBe("unclaimed");
    expect(parseVendorListParams({ archived: "1" }).show).toBe("archived");
    expect(parseVendorListParams({ archived: "1", show: "verified" }).show).toBe("verified");
  });
});

describe("vendorListWhere", () => {
  it("hides archived vendors except in the archived scope", () => {
    expect(vendorListWhere({ q: "", show: "all" })).toEqual({ AND: [{ deletedAt: null }] });
    expect(vendorListWhere({ q: "", show: "archived" })).toEqual({ AND: [{ deletedAt: { not: null } }] });
  });

  it("filters claim and verification", () => {
    expect(vendorListWhere({ q: "", show: "unclaimed" }).AND).toContainEqual({ userId: null });
    expect(vendorListWhere({ q: "", show: "verified" }).AND).toContainEqual({ verificationStatus: "VERIFIED" });
    expect(vendorListWhere({ q: "", show: "waiting" }).AND).toContainEqual({ verificationStatus: "PENDING" });
  });

  it("searches the business, specialties and the owner's name and email", () => {
    const where = vendorListWhere({ q: "dana", show: "all" });
    const search = (where.AND as Array<Record<string, unknown>>)[1] as { OR: unknown[] };
    expect(search.OR).toHaveLength(5);
    expect(search.OR).toContainEqual({ user: { is: { email: { contains: "dana", mode: "insensitive" } } } });
  });
});

describe("list links", () => {
  it("drops defaults from the URL", () => {
    expect(vendorListHref({ q: "", show: "all", page: 1 })).toBe("/admin/vendors");
    expect(vendorListHref({ q: "mugs", show: "verified", page: 2 })).toBe("/admin/vendors?q=mugs&show=verified&page=2");
  });

  it("exports what the list shows when the export can filter the same way", () => {
    expect(vendorExport({ q: "", show: "all" })).toEqual({ href: "/api/admin/data/export/entity?entity=vendors", label: "Export CSV" });
    expect(vendorExport({ q: "", show: "unclaimed" })).toEqual({
      href: "/api/admin/data/export/entity?entity=vendors&orphaned=1",
      label: "Export CSV",
    });
  });

  it("offers every active vendor when the export cannot match the list", () => {
    const all = { href: "/api/admin/data/export/entity?entity=vendors", label: "Export all vendors" };
    expect(vendorExport({ q: "", show: "verified" })).toEqual(all);
    expect(vendorExport({ q: "", show: "waiting" })).toEqual(all);
    expect(vendorExport({ q: "", show: "archived" })).toEqual(all);
    expect(vendorExport({ q: "mugs", show: "all" })).toEqual(all);
    expect(vendorExport({ q: "dana", show: "unclaimed" })).toEqual(all);
  });

  it("returns to the list the vendor was opened from, and only to the vendor list", () => {
    expect(safeVendorListBack("/admin/vendors?show=waiting&page=2")).toBe("/admin/vendors?show=waiting&page=2");
    expect(safeVendorListBack("/admin/vendors")).toBe("/admin/vendors");
    expect(safeVendorListBack(["/admin/vendors?q=jam", "/elsewhere"])).toBe("/admin/vendors?q=jam");
    expect(safeVendorListBack(undefined)).toBe("/admin/vendors");
    expect(safeVendorListBack("//evil.example/admin/vendors")).toBe("/admin/vendors");
    expect(safeVendorListBack("https://evil.example")).toBe("/admin/vendors");
    expect(safeVendorListBack("/admin/vendorsevil")).toBe("/admin/vendors");
    expect(safeVendorListBack("/admin/events")).toBe("/admin/vendors");
  });

  it("carries the list address on vendor links only when it has filters", () => {
    expect(vendorPageHref("v1")).toBe("/admin/vendors/v1");
    expect(vendorPageHref("v1", "/admin/vendors")).toBe("/admin/vendors/v1");
    expect(vendorPageHref("v1", "/admin/vendors?show=waiting&page=2")).toBe("/admin/vendors/v1?back=%2Fadmin%2Fvendors%3Fshow%3Dwaiting%26page%3D2");
  });
});

describe("wording", () => {
  it("says which filter emptied the list", () => {
    expect(vendorEmptyMessage({ q: "", show: "all" })).toBe("No vendor profiles yet.");
    expect(vendorEmptyMessage({ q: "", show: "waiting" })).toBe("No vendors waiting for verification.");
    expect(vendorEmptyMessage({ q: "bridal", show: "verified" })).toBe('No verified vendors match "bridal".');
  });

  it("announces the result count", () => {
    expect(vendorCountSentence(1, { q: "", show: "all" })).toBe("1 vendor.");
    expect(vendorCountSentence(4, { q: "jam", show: "unclaimed" })).toBe('4 vendors not claimed matching "jam".');
  });

  it("names verification with words only", () => {
    expect(verificationMarkStatus("VERIFIED")).toBe("VERIFIED");
    expect(verificationMarkStatus("PENDING")).toBe("VERIFICATION_PENDING");
    expect(verificationMarkStatus("UNVERIFIED")).toBe("NOT_VERIFIED");
  });

  it("counts each event once per vendor, however it is linked", () => {
    const counts = countEventsByVendor([
      { vendorProfileId: "v1", eventId: "e1" },
      { vendorProfileId: "v1", eventId: "e1" },
      { vendorProfileId: "v1", eventId: "e2" },
      { vendorProfileId: "v2", eventId: "e1" },
    ]);
    expect(counts.get("v1")).toBe(2);
    expect(counts.get("v2")).toBe(1);
    expect(counts.get("v3")).toBeUndefined();
  });

  it("lists the categories in use, most used first, merging case and spacing", () => {
    expect(topCategories(["Produce", "produce ", null, "Crafts", "Baked  goods", "baked goods", "PRODUCE", ""])).toEqual(["Produce", "Baked goods", "Crafts"]);
    expect(topCategories(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  it("counts events in words", () => {
    expect(eventsAtLabel(0)).toBe("At no events");
    expect(eventsAtLabel(1)).toBe("At 1 event");
    expect(eventsAtLabel(3)).toBe("At 3 events");
  });
});
