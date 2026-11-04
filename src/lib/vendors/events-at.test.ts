import { describe, expect, it } from "vitest";
import { LISTED_WORDS, vendorEventsAt, type VendorLinkEvent } from "./events-at";

const NOW = new Date("2026-11-03T17:00:00Z");

function event(id: string, start: string, end: string = start, extra: Partial<VendorLinkEvent> = {}): VendorLinkEvent {
  return {
    id,
    title: `Event ${id}`,
    slug: `event-${id}`,
    status: "PUBLISHED",
    startDate: new Date(`${start}T18:00:00Z`),
    endDate: new Date(`${end}T23:00:00Z`),
    deletedAt: null,
    ...extra,
  };
}

describe("vendorEventsAt", () => {
  it("merges the three link tables into one row per event, the organizer's list first", () => {
    const e = event("a", "2026-11-07");
    const result = vendorEventsAt(
      {
        listed: [{ event: e }],
        intents: [{ status: "ATTENDING", event: e }],
        roster: [{ status: "CONFIRMED", event: e }],
      },
      NOW
    );
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0].events).toHaveLength(1);
    expect(result.upcoming[0].events[0].links).toEqual(["On the organizer's official list", "Going", LISTED_WORDS]);
  });

  it("groups upcoming events by the weekend of their first day", () => {
    const result = vendorEventsAt(
      {
        listed: [{ event: event("sat", "2026-11-07") }, { event: event("fri", "2026-11-06", "2026-11-08") }, { event: event("later", "2026-11-14") }],
        intents: [],
        roster: [],
      },
      NOW
    );
    expect(result.upcoming.map((w) => w.saturday)).toEqual(["2026-11-07", "2026-11-14"]);
    expect(result.upcoming[0].heading).toBe("Weekend of Nov 6 to 8");
    expect(result.upcoming[0].events.map((r) => r.id)).toEqual(["fri", "sat"]);
    expect(result.upcoming[0].events[0].when).toBe("Fri Nov 6 to Sun Nov 8");
  });

  it("files an event that started earlier and still runs under this weekend", () => {
    const result = vendorEventsAt({ listed: [{ event: event("run", "2026-10-30", "2026-11-05") }], intents: [], roster: [] }, NOW);
    expect(result.upcoming[0].saturday).toBe("2026-11-07");
  });

  it("puts finished events in past, newest first", () => {
    const result = vendorEventsAt(
      {
        listed: [{ event: event("old", "2026-09-12") }, { event: event("newer", "2026-10-17") }],
        intents: [{ status: "WITHDREW", event: event("newer", "2026-10-17") }],
        roster: [],
      },
      NOW
    );
    expect(result.upcoming).toEqual([]);
    expect(result.past.map((r) => r.id)).toEqual(["newer", "old"]);
    expect(result.past[0].links).toEqual(["Withdrew", LISTED_WORDS]);
  });

  it("marks archived events", () => {
    const result = vendorEventsAt(
      { listed: [], intents: [], roster: [{ status: "INVITED", event: event("x", "2026-11-21", "2026-11-21", { deletedAt: new Date() }) }] },
      NOW
    );
    expect(result.upcoming[0].events[0]).toMatchObject({ archived: true, links: ["Invited by the organizer"] });
  });

  it("returns nothing for a vendor without links", () => {
    expect(vendorEventsAt({ listed: [], intents: [], roster: [] }, NOW)).toEqual({ upcoming: [], past: [] });
  });
});
