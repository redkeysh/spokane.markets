import { describe, expect, it } from "vitest";
import {
  inboxBack,
  inboxHref,
  inboxItemHref,
  legacyInboxHref,
  legacySubmissionsHref,
  parseInboxParams,
  publicItemHref,
  statusFilter,
  statusFromEnum,
  statusLabel,
} from "./model";

describe("parseInboxParams", () => {
  it("reads the view, status, search, person, item and page", () => {
    expect(parseInboxParams({ type: "reviews", status: "approved", q: "  great ", user: "u1", item: "r1", page: "3" })).toEqual({
      view: "reviews",
      status: "approved",
      q: "great",
      user: "u1",
      item: "r1",
      page: 3,
    });
  });

  it("falls back to everything for unknown views and statuses", () => {
    expect(parseInboxParams({ type: "nope", status: "approved" })).toMatchObject({ view: "all", status: "all" });
    expect(parseInboxParams({ type: "reports", status: "approved" }).status).toBe("all");
    expect(parseInboxParams({ type: "messages", status: "read" }).status).toBe("read");
  });

  it("keeps the person filter for reviews and photos only, and ignores ids that are not ids", () => {
    expect(parseInboxParams({ type: "reports", user: "u1" }).user).toBe("");
    expect(parseInboxParams({ type: "photos", user: "u1" }).user).toBe("u1");
    expect(parseInboxParams({ type: "photos", user: "a b" }).user).toBe("");
    expect(parseInboxParams({ type: "all", item: "r1" }).item).toBe("");
  });

  it("reads the first of repeated values and keeps the page positive", () => {
    expect(parseInboxParams({ type: ["photos", "reviews"], page: "-2" })).toMatchObject({ view: "photos", page: 1 });
  });
});

describe("inboxHref", () => {
  it("leaves defaults out", () => {
    expect(inboxHref()).toBe("/admin/inbox");
    expect(inboxHref({ view: "all", status: "all", page: 1 })).toBe("/admin/inbox");
    expect(inboxHref({ view: "photos", status: "waiting", user: "u1", page: 2 })).toBe("/admin/inbox?type=photos&status=waiting&user=u1&page=2");
  });

  it("round-trips through parseInboxParams", () => {
    const href = inboxHref({ view: "applications", status: "needs-info", q: "dana smith" });
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseInboxParams(params)).toMatchObject({ view: "applications", status: "needs-info", q: "dana smith" });
  });
});

describe("statusFilter", () => {
  it("maps URL statuses to database statuses per type", () => {
    expect(statusFilter("reviews", "waiting")).toEqual(["PENDING"]);
    expect(statusFilter("reviews", "decided")).toEqual(["APPROVED", "REJECTED"]);
    expect(statusFilter("applications", "needs-info")).toEqual(["NEEDS_INFO"]);
    expect(statusFilter("messages", "archived")).toEqual(["ARCHIVED"]);
    expect(statusFilter("reports", "all")).toBeNull();
    expect(statusFilter("surveys", "waiting")).toBeNull();
  });
});

describe("statusLabel", () => {
  it("says Unread for waiting messages", () => {
    expect(statusLabel("messages", "waiting")).toBe("Unread");
    expect(statusLabel("reviews", "waiting")).toBe("Waiting");
    expect(statusLabel("applications", "needs-info")).toBe("Needs info");
    expect(statusLabel("photos", "approved")).toBe("Showing");
    expect(statusLabel("reviews", "approved")).toBe("Approved");
  });
});

describe("old addresses", () => {
  it("maps old status enums", () => {
    expect(statusFromEnum("PENDING")).toBe("waiting");
    expect(statusFromEnum("needs_info")).toBe("needs-info");
    expect(statusFromEnum("bogus")).toBeNull();
    expect(statusFromEnum(undefined)).toBeNull();
  });

  it("carries the status and, for reviews and photos, the person over", () => {
    expect(legacyInboxHref("reviews", { status: "APPROVED", user: "u1" })).toBe("/admin/inbox?type=reviews&status=approved&user=u1");
    expect(legacyInboxHref("photos", { status: "REJECTED", user: "u2" })).toBe("/admin/inbox?type=photos&status=rejected&user=u2");
    expect(legacyInboxHref("reports", { status: "DISMISSED", user: "u1" })).toBe("/admin/inbox?type=reports&status=dismissed");
    expect(legacyInboxHref("applications", { status: "NEEDS_INFO" })).toBe("/admin/inbox?type=applications&status=needs-info");
  });

  it("shows waiting reviews, photos and reports when the old address had no known status, as those pages did", () => {
    expect(legacyInboxHref("photos", { user: "u2" })).toBe("/admin/inbox?type=photos&status=waiting&user=u2");
    expect(legacyInboxHref("reviews", {})).toBe("/admin/inbox?type=reviews&status=waiting");
    expect(legacyInboxHref("reports", { status: "APPROVED" })).toBe("/admin/inbox?type=reports&status=waiting");
    expect(legacyInboxHref("applications", {})).toBe("/admin/inbox?type=applications");
  });

  it("sends waiting submissions to To do and the rest to the inbox", () => {
    expect(legacySubmissionsHref({})).toBe("/admin?lane=public");
    expect(legacySubmissionsHref({ status: "PENDING" })).toBe("/admin?lane=public");
    expect(legacySubmissionsHref({ status: "REJECTED" })).toBe("/admin/inbox?type=submissions&status=rejected");
    expect(legacySubmissionsHref({ status: "ALL" })).toBe("/admin/inbox?type=submissions");
  });
});

describe("publicItemHref", () => {
  it("opens public items on their own and leaves submissions and unknown rows out", () => {
    expect(publicItemHref("review", "r1")).toBe("/admin/inbox?type=reviews&item=r1");
    expect(publicItemHref("message", "m1")).toBe("/admin/inbox?type=messages&item=m1");
    expect(publicItemHref("submission", "s1")).toBeNull();
    expect(publicItemHref("event", "e1")).toBeNull();
  });
});

describe("the way back from one item", () => {
  it("opens an item with the list's address and reads it back", () => {
    const list = "/admin/inbox?type=reviews&status=approved&q=bridal&page=2";
    const href = inboxItemHref("reviews", "r1", list);
    expect(href).toBe(`/admin/inbox?type=reviews&item=r1&back=${encodeURIComponent(list)}`);
    expect(inboxBack(new URL(href, "http://x").searchParams.get("back") ?? undefined)).toEqual({ href: list, label: "Back to Reviews" });
    expect(inboxBack("/admin/inbox")).toEqual({ href: "/admin/inbox", label: "Back to From the public" });
  });

  it("refuses anything that is not an inbox list", () => {
    expect(inboxBack(undefined)).toBeNull();
    expect(inboxBack("https://evil.example/admin/inbox")).toBeNull();
    expect(inboxBack("/admin/inboxes")).toBeNull();
    expect(inboxBack("/admin/events")).toBeNull();
    expect(inboxBack("/admin/inbox?type=reviews&item=r2")).toBeNull();
  });
});
