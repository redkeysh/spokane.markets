import { describe, it, expect } from "vitest";
import {
  extractSocialHandle,
  buildFacebookUrl,
  buildInstagramUrl,
  filterUpcomingScheduleDays,
  formatPhoneNumber,
  formatPhoneInput,
  getFacebookDisplayUrl,
  getDateOnlyInTimezone,
  getInstagramDisplayUrl,
  normalizeUrlToHttps,
} from "./utils";

describe("formatPhoneNumber", () => {
  it("formats 10-digit US number as (XXX) XXX-XXXX", () => {
    expect(formatPhoneNumber("5095551234")).toBe("(509) 555-1234");
  });

  it("formats 11-digit number with leading 1 as +1 (XXX) XXX-XXXX", () => {
    expect(formatPhoneNumber("15095551234")).toBe("+1 (509) 555-1234");
  });

  it("formats already-formatted input consistently", () => {
    expect(formatPhoneNumber("(509) 555-1234")).toBe("(509) 555-1234");
  });

  it("returns trimmed input for non-standard lengths", () => {
    expect(formatPhoneNumber("50955512")).toBe("50955512");
  });

  it("strips formatting from input before formatting", () => {
    expect(formatPhoneNumber("509-555-1234")).toBe("(509) 555-1234");
    expect(formatPhoneNumber(" 509-555-1234 ")).toBe("(509) 555-1234");
  });

  it("returns empty string for null, undefined, or whitespace", () => {
    expect(formatPhoneNumber(null)).toBe("");
    expect(formatPhoneNumber(undefined)).toBe("");
    expect(formatPhoneNumber("")).toBe("");
    expect(formatPhoneNumber("   ")).toBe("");
  });
});

describe("formatPhoneInput", () => {
  it("formats as user types", () => {
    expect(formatPhoneInput("5")).toBe("(5");
    expect(formatPhoneInput("509")).toBe("(509");
    expect(formatPhoneInput("5095")).toBe("(509) 5");
    expect(formatPhoneInput("5095551234")).toBe("(509) 555-1234");
  });

  it("handles 11-digit with leading 1", () => {
    expect(formatPhoneInput("15095551234")).toBe("+1 (509) 555-1234");
  });

  it("strips non-digits before formatting", () => {
    expect(formatPhoneInput("509-555-1234")).toBe("(509) 555-1234");
  });
});

describe("normalizeUrlToHttps", () => {
  it("leaves https:// URLs unchanged", () => {
    expect(normalizeUrlToHttps("https://example.com")).toBe("https://example.com");
  });

  it("converts http:// to https://", () => {
    expect(normalizeUrlToHttps("http://example.com")).toBe("https://example.com");
  });

  it("adds https:// to www. URLs", () => {
    expect(normalizeUrlToHttps("www.example.com")).toBe("https://www.example.com");
  });

  it("adds https:// to bare domains", () => {
    expect(normalizeUrlToHttps("example.com")).toBe("https://example.com");
  });

  it("returns empty string for empty or whitespace input", () => {
    expect(normalizeUrlToHttps("")).toBe("");
    expect(normalizeUrlToHttps("   ")).toBe("");
  });
});

describe("extractSocialHandle", () => {
  it("extracts handle from Facebook URL", () => {
    expect(extractSocialHandle("https://facebook.com/johndoe", "facebook")).toBe("johndoe");
    expect(extractSocialHandle("https://www.facebook.com/johndoe", "facebook")).toBe("johndoe");
    expect(extractSocialHandle("facebook.com/johndoe", "facebook")).toBe("johndoe");
  });

  it("extracts handle from Instagram URL", () => {
    expect(extractSocialHandle("https://instagram.com/johndoe", "instagram")).toBe("johndoe");
    expect(extractSocialHandle("instagram.com/johndoe", "instagram")).toBe("johndoe");
  });

  it("returns handle as-is when not a URL", () => {
    expect(extractSocialHandle("johndoe", "facebook")).toBe("johndoe");
    expect(extractSocialHandle("johndoe", "instagram")).toBe("johndoe");
  });
});

describe("buildFacebookUrl / buildInstagramUrl", () => {
  it("builds correct URLs from handles", () => {
    expect(buildFacebookUrl("johndoe")).toBe("https://facebook.com/johndoe");
    expect(buildInstagramUrl("johndoe")).toBe("https://instagram.com/johndoe");
  });
});

describe("getFacebookDisplayUrl / getInstagramDisplayUrl", () => {
  it("builds clickable URLs from handles", () => {
    expect(getFacebookDisplayUrl("johndoe")).toBe("https://facebook.com/johndoe");
    expect(getInstagramDisplayUrl("johndoe")).toBe("https://instagram.com/johndoe");
  });

  it("normalizes existing social URLs and preserves path/query", () => {
    expect(getFacebookDisplayUrl("facebook.com/johndoe")).toBe("https://facebook.com/johndoe");
    expect(getFacebookDisplayUrl("https://m.facebook.com/story.php?story_fbid=1&id=2"))
      .toBe("https://m.facebook.com/story.php?story_fbid=1&id=2");
    expect(getInstagramDisplayUrl("http://instagram.com/johndoe/"))
      .toBe("https://instagram.com/johndoe/");
  });

  it("supports @handles and empty values", () => {
    expect(getFacebookDisplayUrl("@johndoe")).toBe("https://facebook.com/johndoe");
    expect(getInstagramDisplayUrl("@johndoe")).toBe("https://instagram.com/johndoe");
    expect(getFacebookDisplayUrl("")).toBeNull();
    expect(getInstagramDisplayUrl(undefined)).toBeNull();
  });
});

describe("upcoming schedule helpers", () => {
  it("derives pacific date-only value from UTC now", () => {
    const now = new Date("2026-04-04T07:30:00.000Z");
    expect(getDateOnlyInTimezone(now, "America/Los_Angeles")).toBe("2026-04-04");
  });

  it("keeps only schedule rows that are today-or-later in Pacific", () => {
    const rows = [
      { id: "past", date: new Date("2026-04-03T12:00:00.000Z") },
      { id: "today", date: new Date("2026-04-04T12:00:00.000Z") },
      { id: "future", date: new Date("2026-04-05T12:00:00.000Z") },
    ];
    const upcoming = filterUpcomingScheduleDays(rows, {
      now: new Date("2026-04-04T18:00:00.000Z"),
      timeZone: "America/Los_Angeles",
    });
    expect(upcoming.map((r) => r.id)).toEqual(["today", "future"]);
  });
});
