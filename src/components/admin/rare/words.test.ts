import { describe, expect, it } from "vitest";
import { pageHref } from "./page-href";
import { areaWords, badgeUse, countWord, joinWords } from "./words";

describe("countWord", () => {
  it("picks one or many", () => {
    expect(countWord(1, "event", "events")).toBe("1 event");
    expect(countWord(0, "event", "events")).toBe("0 events");
    expect(countWord(12, "event", "events")).toBe("12 events");
  });
});

describe("badgeUse", () => {
  it("names who uses a badge", () => {
    expect(badgeUse(0, 0)).toBe("Not used yet");
    expect(badgeUse(3, 0)).toBe("Used by 3 vendors");
    expect(badgeUse(0, 1)).toBe("Used by 1 market");
    expect(badgeUse(1, 2)).toBe("Used by 1 vendor and 2 markets");
  });
});

describe("areaWords", () => {
  const labels = new Map([
    ["downtown", "Downtown"],
    ["hillyard", "Hillyard"],
    ["perry", "Perry District"],
    ["kendall", "Kendall Yards"],
    ["valley", "Spokane Valley"],
  ]);

  it("reads no areas as every area", () => {
    expect(areaWords([], labels)).toBe("Every area");
  });

  it("names up to three and counts the rest", () => {
    expect(areaWords(["downtown", "hillyard"], labels)).toBe("Downtown, Hillyard");
    expect(areaWords(["downtown", "hillyard", "perry", "kendall", "valley"], labels)).toBe(
      "Downtown, Hillyard, Perry District and 2 more"
    );
  });

  it("falls back to the stored value for an area no longer listed", () => {
    expect(areaWords(["old-area"], labels)).toBe("old-area");
  });
});

describe("joinWords", () => {
  it("joins like a sentence", () => {
    expect(joinWords([])).toBe("");
    expect(joinWords(["a"])).toBe("a");
    expect(joinWords(["a", "b"])).toBe("a and b");
    expect(joinWords(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("pageHref", () => {
  it("keeps filters, drops empty ones and leaves page 1 out", () => {
    expect(pageHref("/admin/users", { q: "dana", role: undefined, limit: "" }, 1)).toBe("/admin/users?q=dana");
    expect(pageHref("/admin/users", { q: "dana", page: "7" }, 3)).toBe("/admin/users?q=dana&page=3");
    expect(pageHref("/admin/subscribers", {}, 1)).toBe("/admin/subscribers");
  });
});
