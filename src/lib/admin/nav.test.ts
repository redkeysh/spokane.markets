import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_NAV, PHONE_NAV_KEYS, activeNavKey, hasWeekChips, phoneNavKey, railVariant, weekHref } from "./nav";

describe("ADMIN_NAV", () => {
  it("has the top bar items in order", () => {
    expect(ADMIN_NAV.map((i) => i.label)).toEqual(["To do", "Events", "Markets", "Venues", "Vendors", "Site", "More"]);
  });

  it("links every item and phone item to a page that exists", () => {
    const pages = new Set(
      readdirSync(join(process.cwd(), "src/app/admin"), { recursive: true, encoding: "utf8" })
        .map((f) => f.replaceAll("\\", "/"))
        .filter((f) => /(^|\/)page\.tsx$/.test(f))
        .map((f) => ("/admin/" + f.replace(/(^|\/)page\.tsx$/, "")).replace(/\/$/, ""))
    );
    for (const item of ADMIN_NAV) expect(pages, item.href).toContain(item.href);
    for (const key of PHONE_NAV_KEYS) expect(ADMIN_NAV.some((i) => i.key === key), key).toBe(true);
  });
});

describe("activeNavKey", () => {
  it("maps the home and the public queues to To do", () => {
    expect(activeNavKey("/admin")).toBe("todo");
    expect(activeNavKey("/admin/submissions/abc")).toBe("todo");
    expect(activeNavKey("/admin/queues")).toBe("todo");
    expect(activeNavKey("/admin/applications")).toBe("todo");
  });

  it("uses the longest matching prefix", () => {
    expect(activeNavKey("/admin/applications/forms")).toBe("more");
    expect(activeNavKey("/admin/applications/forms/xyz")).toBe("more");
  });

  it("maps sections and their nested routes", () => {
    expect(activeNavKey("/admin/events")).toBe("events");
    expect(activeNavKey("/admin/events/abc/edit")).toBe("events");
    expect(activeNavKey("/admin/neighborhoods")).toBe("venues");
    expect(activeNavKey("/admin/settings")).toBe("site");
    expect(activeNavKey("/admin/marketing/asset-studio/history")).toBe("site");
  });

  it("does not match a prefix inside a longer segment", () => {
    expect(activeNavKey("/admin/eventsx")).toBe("more");
  });

  it("sends the rare screens to More and leaves non-admin paths alone", () => {
    expect(activeNavKey("/admin/users")).toBe("more");
    expect(activeNavKey("/admin/audit-log")).toBe("more");
    expect(activeNavKey("/events")).toBeNull();
  });
});

describe("phoneNavKey", () => {
  it("highlights More for screens that live under More on phones", () => {
    expect(phoneNavKey("/admin/vendors")).toBe("more");
    expect(phoneNavKey("/admin/site")).toBe("more");
    expect(phoneNavKey("/admin/marketing/asset-studio")).toBe("more");
    expect(phoneNavKey("/admin/users")).toBe("more");
  });

  it("keeps the phone items and nothing outside the admin", () => {
    expect(phoneNavKey("/admin")).toBe("todo");
    expect(phoneNavKey("/admin/venues/v1")).toBe("venues");
    expect(phoneNavKey("/events")).toBeNull();
  });
});

describe("rail placement", () => {
  it("shows the full rail on To do only", () => {
    expect(railVariant("/admin")).toBe("full");
    expect(railVariant("/admin/events")).toBe("slim");
  });

  it("shows week chips on To do and the Events list only", () => {
    expect(hasWeekChips("/admin")).toBe(true);
    expect(hasWeekChips("/admin/events")).toBe(true);
    expect(hasWeekChips("/admin/events/new")).toBe(false);
    expect(hasWeekChips("/admin/venues")).toBe(false);
  });

  it("links columns to the pile on To do and to Events elsewhere", () => {
    expect(weekHref("/admin", "2026-11-07")).toBe("/admin?week=2026-11-07");
    expect(weekHref("/admin/venues", "later")).toBe("/admin/events?week=later");
  });
});
