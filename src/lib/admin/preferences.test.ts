import { describe, expect, it } from "vitest";
import { parseAdminMode, parseSingleKeys, serializeSingleKeys } from "./preferences";

describe("parseAdminMode", () => {
  it("accepts the three modes", () => {
    expect(parseAdminMode("system")).toBe("system");
    expect(parseAdminMode("light")).toBe("light");
    expect(parseAdminMode("dark")).toBe("dark");
  });

  it("falls back to system for a missing or unknown value", () => {
    expect(parseAdminMode(undefined)).toBe("system");
    expect(parseAdminMode(null)).toBe("system");
    expect(parseAdminMode("")).toBe("system");
    expect(parseAdminMode("Dark")).toBe("system");
    expect(parseAdminMode("sepia")).toBe("system");
  });
});

describe("parseSingleKeys", () => {
  it("is on unless the cookie says off", () => {
    expect(parseSingleKeys(undefined)).toBe(true);
    expect(parseSingleKeys("on")).toBe(true);
    expect(parseSingleKeys("garbage")).toBe(true);
    expect(parseSingleKeys("off")).toBe(false);
  });

  it("round-trips through serializeSingleKeys", () => {
    expect(parseSingleKeys(serializeSingleKeys(true))).toBe(true);
    expect(parseSingleKeys(serializeSingleKeys(false))).toBe(false);
  });
});
