import { describe, expect, it } from "vitest";
import { andList, bulkMessage, railAfterPublish, tellLabel } from "./bulk-messages";

const titles: Record<string, string> = { a: "Emerge Holiday Market", b: "CardCon", c: "Rebel Junk Holiday Market" };
const context = (target?: string) => ({ titleOf: (id: string) => titles[id], target });
const counts = (changed: string[], extra: Partial<{ already: string[]; failed: { id: string; reason: string }[]; notified: string[] }> = {}) => ({
  changed,
  already: extra.already ?? [],
  failed: extra.failed ?? [],
  notified: extra.notified ?? [],
});

describe("bulkMessage", () => {
  it("reports a publish with what was already live", () => {
    expect(bulkMessage("publish", counts(["a", "b", "c"], { already: ["d"] }), context())).toBe("Published 3. 1 was already live.");
  });

  it("names a single event by its title", () => {
    expect(bulkMessage("publish", counts(["a"]), context())).toBe("Published Emerge Holiday Market.");
  });

  it("says why an event stayed off the site and who was told", () => {
    expect(
      bulkMessage(
        "publish",
        counts(["a", "c"], { failed: [{ id: "b", reason: "Can't publish yet: no ZIP." }], notified: ["Dana", "Lee"] }),
        context()
      )
    ).toBe("Published 2. CardCon stays off the site. Can't publish yet: no ZIP. Dana and Lee were told.");
  });

  it("words rejections, archives and restores", () => {
    expect(bulkMessage("reject", counts(["a", "b"], { already: ["c", "d"] }), context())).toBe("Rejected 2. 2 were already rejected.");
    expect(bulkMessage("archive", counts(["b"]), context())).toBe("Archived CardCon.");
    expect(bulkMessage("restore", counts([]), context())).toBe("Nothing was restored.");
  });

  it("names the market, place or tag", () => {
    expect(bulkMessage("link", counts(["a", "b"]), context("Kendall Yards Night Market"))).toBe("Linked 2 to Kendall Yards Night Market.");
    expect(bulkMessage("unlink", counts(["a"]), context())).toBe("Took Emerge Holiday Market out of its market.");
    expect(bulkMessage("place", counts(["a", "b"], { already: ["c"] }), context("Kendall Yards"))).toBe("Moved 2 to Kendall Yards. 1 was already there.");
    expect(bulkMessage("tag", counts(["a", "b", "c"], { already: ["d"] }), context("Holiday Market"))).toBe("Added Holiday Market to 3. 1 already had it.");
  });

  it("reports changes that could not be made", () => {
    expect(
      bulkMessage("place", counts(["a"], { failed: [{ id: "x", reason: "That venue does not exist or is archived." }] }), context("Kendall Yards"))
    ).toBe("Moved Emerge Holiday Market to Kendall Yards. 1 event could not be changed. That venue does not exist or is archived.");
  });
});

describe("railAfterPublish", () => {
  const weeks = [
    { label: "Nov 7", live: 1, stalls: [{ id: "y", status: "PUBLISHED" }, ...["a", "b", "c"].map((id) => ({ id, status: "PENDING" }))] },
    { label: "Nov 14", live: 0, stalls: [{ id: "d", status: "DRAFT" }] },
    { label: "Nov 21", live: 0, stalls: [{ id: "e", status: "DRAFT" }] },
  ];

  it("says how full the weekend is now", () => {
    expect(railAfterPublish(weeks, ["a", "b"])).toBe("Nov 7 is now 3 of 4 live.");
  });

  it("names two weekends and counts the rest", () => {
    expect(railAfterPublish(weeks, ["a", "d", "e"])).toBe("Nov 7 is now 2 of 4 live, Nov 14 is now 1 of 1 live, and 1 more weekend changed.");
  });

  it("ignores stalls that were already live and events off the rail", () => {
    expect(railAfterPublish(weeks, ["y", "zz"])).toBe("");
  });
});

describe("tellLabel and andList", () => {
  it("names one organizer by first name and counts more", () => {
    expect(tellLabel("Reject 3", [])).toBe("Reject 3");
    expect(tellLabel("Reject 3", ["Dana Smith", "Dana Smith"])).toBe("Reject 3 and tell Dana");
    expect(tellLabel("Publish 2", ["Dana", "Lee"])).toBe("Publish 2 and tell 2 organizers");
  });

  it("joins names in plain English", () => {
    expect(andList(["Dana"])).toBe("Dana");
    expect(andList(["Dana", "Lee", "Sam"])).toBe("Dana, Lee and Sam");
  });
});
