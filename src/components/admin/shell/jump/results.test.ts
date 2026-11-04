import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, normalizeQuery, type JumpGroup, type JumpResults } from "@/lib/admin/search";
import type { RailWeek } from "@/lib/admin/weekends";
import { JUMP_COMMANDS, JUMP_PAGES } from "./pages";
import {
  JUMP_MAX_QUERY,
  JUMP_MIN_QUERY,
  filterLocal,
  hitLabel,
  jumpAnnouncement,
  jumpQuery,
  moreLabel,
  weekendHref,
  weekendLabel,
} from "./results";

const week = (live: number, pending: number, draft: number): RailWeek => ({
  key: "2026-12-12",
  saturday: "2026-12-12",
  label: "Dec 12",
  name: null,
  live,
  pending,
  draft,
  stalls: [],
});

const group = (key: JumpGroup["key"], hits: number, more = false): JumpGroup => ({
  key,
  heading: key,
  hits: Array.from({ length: hits }, (_, i) => ({
    id: `${key}${i}`,
    href: `/admin/${key}/${i}`,
    title: `${key} ${i}`,
    meta: null,
    status: null,
    note: null,
  })),
  moreHref: more ? `/admin/${key}?q=x` : null,
});

describe("jumpQuery", () => {
  it("normalizes the way the server does", () => {
    expect(JUMP_MAX_QUERY).toBe(MAX_QUERY_LENGTH);
    expect(JUMP_MIN_QUERY).toBe(MIN_QUERY_LENGTH);
    for (const raw of ["  kendall   yards ", "\tdec\n12", "x".repeat(140), ""]) {
      expect(jumpQuery(raw)).toBe(normalizeQuery(raw));
    }
  });
});

describe("filterLocal", () => {
  it("keeps every page in order for an empty query", () => {
    expect(filterLocal(JUMP_PAGES, " ")).toEqual([...JUMP_PAGES]);
  });

  it("finds pages and commands by the owner's words, best first", () => {
    expect(filterLocal(JUMP_PAGES, "permissions").map((p) => p.id)).toContain("users");
    expect(filterLocal(JUMP_PAGES, "banner")[0].id).toBe("site");
    expect(filterLocal(JUMP_PAGES, "venues")[0].id).toBe("venues");
    expect(filterLocal(JUMP_COMMANDS, "dark").map((c) => c.id)).toContain("mode-dark");
  });

  it("leaves out scattered-letter matches once two letters are typed", () => {
    expect(filterLocal(JUMP_PAGES, "kendall")).toEqual([]);
    expect(filterLocal(JUMP_COMMANDS, "dana")).toEqual([]);
    expect(filterLocal(JUMP_PAGES, "pe").map((p) => p.id)).toEqual(["users", "tags"]);
    expect(filterLocal(JUMP_PAGES, "p").length).toBeGreaterThan(1);
  });

  it("keeps a match inside a word", () => {
    expect(filterLocal(JUMP_PAGES, "scribe").map((p) => p.id)).toEqual(["subscribers"]);
    expect(filterLocal(JUMP_PAGES, "port").map((p) => p.id)).toEqual(expect.arrayContaining(["reports", "data"]));
  });
});

describe("labels", () => {
  it("reads a hit as one line: title, meta and status or note", () => {
    expect(
      hitLabel({
        id: "e1",
        href: "/admin/events/e1",
        title: "Kendall Yards Christmas Market",
        meta: "Sat Nov 28, Kendall Yards, Spokane",
        status: "PENDING",
        note: null,
      })
    ).toBe("Kendall Yards Christmas Market, Sat Nov 28, Kendall Yards, Spokane, Pending");
    expect(
      hitLabel({ id: "u1", href: "/admin/users/u1", title: "dana@example.com", meta: null, status: null, note: "Organizer" })
    ).toBe("dana@example.com, Organizer");
  });

  it("names the full list and the weekend", () => {
    expect(moreLabel("people", "dana")).toBe("See all people matching “dana”");
    expect(
      weekendLabel({
        saturday: "2026-12-12",
        title: "Weekend of Sat Dec 12",
        meta: "Includes Thu Dec 10",
        week: week(0, 9, 2),
        onRail: true,
      })
    ).toBe("Weekend of Sat Dec 12, Includes Thu Dec 10, 0 of 11 live");
  });
});

describe("weekendHref", () => {
  it("opens the week's lane on To do when the week is on the rail", () => {
    expect(weekendHref({ saturday: "2026-12-12", onRail: true }, "/admin")).toBe("/admin?week=2026-12-12");
  });

  it("opens the events list for the week from any other page", () => {
    expect(weekendHref({ saturday: "2026-12-12", onRail: true }, "/admin/vendors")).toBe("/admin/events?week=2026-12-12");
  });

  it("opens the events list from To do when the week is past the rail", () => {
    expect(weekendHref({ saturday: "2027-03-06", onRail: false }, "/admin")).toBe("/admin/events?week=2027-03-06");
  });
});

describe("jumpAnnouncement", () => {
  const results = (groups: JumpGroup[]): JumpResults => ({ query: "kendall", weekend: null, groups });

  it("counts what was found", () => {
    expect(jumpAnnouncement(results([group("events", 5, true), group("places", 1)]), { pages: 1, commands: 0 })).toBe(
      "1 page, more than 5 events and 1 place."
    );
    expect(jumpAnnouncement(results([group("people", 2)]), { pages: 0, commands: 0 })).toBe("2 people.");
    expect(jumpAnnouncement(results([group("events", 5, true)]), { pages: 0, commands: 0 })).toBe("More than 5 events.");
  });

  it("says when nothing matches", () => {
    expect(jumpAnnouncement(results([]), { pages: 0, commands: 0 })).toBe("Nothing matches “kendall”.");
  });

  it("reads the weekend's caption", () => {
    expect(
      jumpAnnouncement(
        {
          query: "dec 12",
          weekend: { saturday: "2026-12-12", title: "Weekend of Sat Dec 12", meta: null, week: week(13, 0, 0), onRail: true },
          groups: [],
        },
        { pages: 0, commands: 0 }
      )
    ).toBe("Weekend of Sat Dec 12: All 13 live.");
  });

  it("adds the pages and commands listed under the weekend", () => {
    const weekend = {
      query: "this weekend",
      weekend: { saturday: "2026-11-07", title: "Weekend of Sat Nov 7", meta: null, week: week(1, 20, 1), onRail: true },
      groups: [],
    };
    expect(jumpAnnouncement(weekend, { pages: 1, commands: 0 })).toBe("Weekend of Sat Nov 7: 1 of 22 live. Also 1 page.");
    expect(jumpAnnouncement(weekend, { pages: 2, commands: 1 })).toBe(
      "Weekend of Sat Nov 7: 1 of 22 live. Also 2 pages and 1 command."
    );
  });
});
