import { describe, expect, it } from "vitest";
import {
  announcementInputSchema,
  BANNER_PLACES,
  clampFocal,
  featuredWindow,
  maintenanceInputSchema,
  parseMaintenanceEta,
  splitFeatured,
  withoutBlankLinks,
} from "./settings-input";

describe("announcementInputSchema", () => {
  it("needs a message while the bar is on", () => {
    const result = announcementInputSchema.safeParse({ enabled: true, text: " ", linkLabel: "", linkUrl: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ["text"], message: "Write a message, or turn the bar off." });
  });

  it("allows an empty message while the bar is off", () => {
    expect(announcementInputSchema.safeParse({ enabled: false, text: "", linkLabel: "", linkUrl: "" }).success).toBe(true);
  });

  it("needs the link label and the link together", () => {
    const result = announcementInputSchema.safeParse({ enabled: true, text: "Hi", linkLabel: "Apply", linkUrl: "" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["linkUrl"] });
    const other = announcementInputSchema.safeParse({ enabled: true, text: "Hi", linkLabel: "", linkUrl: "/submit" });
    expect(other.error?.issues[0]).toMatchObject({ path: ["linkLabel"] });
  });

  it("rejects links that are not paths or web addresses", () => {
    const result = announcementInputSchema.safeParse({ enabled: true, text: "Hi", linkLabel: "Go", linkUrl: "javascript:alert(1)" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["linkUrl"], message: "Start the link with /, http:// or https://." });
  });

  it("rejects a protocol-relative link, which leaves the site", () => {
    const result = announcementInputSchema.safeParse({ enabled: true, text: "Hi", linkLabel: "Go", linkUrl: "//evil.example/apply" });
    expect(result.error?.issues[0]).toMatchObject({ path: ["linkUrl"] });
  });

  it("accepts site paths and web addresses", () => {
    for (const linkUrl of ["/submit", "https://example.com/apply", "http://example.com"]) {
      expect(announcementInputSchema.safeParse({ enabled: true, text: "Hi", linkLabel: "Go", linkUrl }).success).toBe(true);
    }
  });
});

describe("maintenance input", () => {
  it("drops blank link rows and rejects unsafe links", () => {
    expect(withoutBlankLinks([{ label: " ", url: "" }, { label: "Status", url: "/status" }])).toEqual([{ label: "Status", url: "/status" }]);
    const result = maintenanceInputSchema.safeParse({
      mode: "OFF",
      messageTitle: "",
      messageBody: "",
      links: [{ label: "Evil", url: "//evil.example" }],
      eta: "",
    });
    expect(result.success).toBe(false);
  });

  it("reads the return time as Pacific wall-clock time", () => {
    expect(parseMaintenanceEta("2026-11-07T09:30")?.toISOString()).toBe("2026-11-07T17:30:00.000Z");
    expect(parseMaintenanceEta("2026-07-04T09:30")?.toISOString()).toBe("2026-07-04T16:30:00.000Z");
    expect(parseMaintenanceEta("")).toBeNull();
    expect(parseMaintenanceEta("tomorrow")).toBeNull();
  });
});

describe("banners", () => {
  it("names every banner by the page it shows on", () => {
    expect(BANNER_PLACES.produce.label).toBe("About page");
    expect(BANNER_PLACES.craftStall.label).toBe("Submit page");
    expect(Object.keys(BANNER_PLACES)).toHaveLength(8);
  });

  it("keeps focal points inside the picture", () => {
    expect(clampFocal(-4)).toBe(0);
    expect(clampFocal(33.6)).toBe(34);
    expect(clampFocal(140)).toBe(100);
    expect(clampFocal(Number.NaN)).toBe(50);
  });
});

describe("featured on the homepage", () => {
  const now = new Date("2026-11-03T17:00:00Z");
  const at = (start: string, end: string, id: string) => ({ id, startDate: new Date(start), endDate: new Date(end) });

  it("tells current, upcoming and ended entries apart", () => {
    expect(featuredWindow(at("2026-11-01", "2026-11-30", "a"), now)).toBe("now");
    expect(featuredWindow(at("2026-11-10", "2026-11-30", "b"), now)).toBe("upcoming");
    expect(featuredWindow(at("2026-10-01", "2026-10-31", "c"), now)).toBe("ended");
  });

  it("orders upcoming by start and ended newest first", () => {
    const { current, upcoming, ended } = splitFeatured(
      [
        at("2026-12-01", "2026-12-31", "dec"),
        at("2026-11-10", "2026-11-30", "nov"),
        at("2026-09-01", "2026-09-30", "sep"),
        at("2026-10-01", "2026-10-31", "oct"),
        at("2026-11-01", "2026-11-30", "now"),
      ],
      now
    );
    expect(current.map((p) => p.id)).toEqual(["now"]);
    expect(upcoming.map((p) => p.id)).toEqual(["nov", "dec"]);
    expect(ended.map((p) => p.id)).toEqual(["oct", "sep"]);
  });
});
