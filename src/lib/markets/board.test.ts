import { describe, expect, it } from "vitest";
import {
  boardRowView,
  buildLane,
  buildMarketRows,
  describePlan,
  filterCounts,
  findRepeatsWithoutMarket,
  seasonName,
  seasonWindow,
  seasonsOf,
  type MarketRow,
} from "./board";
import { boardEvents, boardGroups, boardMarkets, SNAPSHOT_NOW } from "./__fixtures__/board-snapshot";

const board = buildMarketRows(boardMarkets, boardEvents, boardGroups, SNAPSHOT_NOW);

function row(name: string): MarketRow {
  const found = board.rows.find((r) => r.market.name === name);
  if (!found) throw new Error(`No row for ${name}`);
  return found;
}

describe("season window", () => {
  it("runs from this month to the same month next year, with today's line near the start", () => {
    const window = seasonWindow("2026-11-03");
    expect(window.start).toBe("2026-11-01");
    expect(window.end).toBe("2027-11-01");
    expect(window.months.map((m) => m.label)).toEqual(["Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
    expect(window.todayX).toBeCloseTo(2 / 365, 5);
  });
});

describe("the board on Nov 3, 2026", () => {
  it("counts the filters: 18 markets, 5 with dates waiting, 13 with nothing ahead, 14 not verified", () => {
    expect(filterCounts(board.rows)).toEqual({ all: 18, waiting: 5, "nothing-ahead": 13, "not-verified": 14, archived: 0 });
  });

  it("sorts markets with waiting dates first, soonest first, then last seasons, then markets with no dates", () => {
    expect(board.rows.slice(0, 5).map((r) => r.market.name)).toEqual([
      "Rathdrum Craft and Farmers Market",
      "Community Market at Silver Lake",
      "Kootenai County Farmers' Market",
      "Kendall Yards Night Market",
      "Terrain Bazaar",
    ]);
    expect(board.rows.slice(5, 8).map((r) => r.tier)).toEqual([2, 2, 2]);
    expect(board.rows.slice(8).every((r) => r.tier === 3)).toBe(true);
  });

  it("flags the Rathdrum date whose web address names another event, and asks for a review", () => {
    const rathdrum = row("Rathdrum Craft and Farmers Market");
    expect(rathdrum.notes.map((n) => n.text)).toContain('Oct 16, 2027 is titled "Family Fall Festival 2027"; its web address says otherwise.');
    expect(rathdrum.actions[0]).toMatchObject({ kind: "review", label: "Review 5" });
  });

  it("offers to link Cabin Fever Indoor Market to Kootenai County Farmers' Market", () => {
    const kootenai = row("Kootenai County Farmers' Market");
    expect(kootenai.lookAlikes.map((e) => e.title)).toEqual(["Cabin Fever Indoor Market", "Cabin Fever Indoor Market"]);
    expect(kootenai.actions[0]).toMatchObject({ kind: "link", label: "Link 2 dates" });
    expect(kootenai.nextText).toBe("none, 2 waiting");
  });

  it("does not offer a spring market another season's fair", () => {
    expect(row("Central Valley High School Spring Craft Fair").lookAlikes).toEqual([]);
    expect(row("Custer's Spring Arts & Crafts Show").lookAlikes).toEqual([]);
  });

  it("shows Kendall Yards' 6 waiting dates, its summer as a ghost, and offers Publish 6 then Repeat last season", () => {
    const kendall = row("Kendall Yards Night Market");
    expect(kendall.lane.stalls).toHaveLength(6);
    expect(kendall.lane.ghostBars).toHaveLength(1);
    expect(kendall.lane.lastSeason).toBe("last season Wed May 20 to Sep 16");
    expect(kendall.actions.map((a) => a.label)).toEqual(["Publish 6", "Repeat last season"]);
    expect(kendall.plan).toHaveLength(18);
    expect(describePlan(kendall.plan.map((p) => p.date), SNAPSHOT_NOW)).toBe("Wednesdays May 19 to Sep 15, 2027");
    expect(kendall.notes.find((n) => n.kind === "same-place-twice")?.text).toBe(
      "6 dates use Kendall Yards (Summit Parkway), the same place as Kendall Yards listed twice."
    );
  });

  it("names the Terrain Bazaar date away from home, and the archived home of University High School", () => {
    expect(row("Terrain Bazaar").notes[0].text).toBe("Its Dec 12 date is at River Park Square, not the market's home place.");
    const university = row("University High School Spring Craft Fair");
    expect(university.notes[0]).toMatchObject({ kind: "home-archived", text: "Its home place is archived." });
    expect(university.actions[0]).toMatchObject({ kind: "fix-place", label: "Fix place" });
  });

  it("reads South Perry Street Fair's next date as its last one, and repeats it a year on", () => {
    const fair = row("South Perry Street Fair");
    expect(fair.nextText).toBe("last Sep 26, 2026");
    expect(fair.plan.map((p) => p.date)).toEqual(["2027-09-25"]);
    expect(fair.actions[0]).toMatchObject({ kind: "repeat" });
  });

  it("folds unverified markets with no dates, and says what the lane shows in words", () => {
    const views = board.rows.map((r) => boardRowView(r, board.window, SNAPSHOT_NOW));
    expect(views.filter((v) => v.folded)).toHaveLength(9);
    const kendall = views.find((v) => v.name === "Kendall Yards Night Market")!;
    expect(kendall.meta).toBe("Verified. Kendall Yards");
    expect(kendall.srSummary).toBe("6 dates ahead, 6 waiting. Next date on the site: none, 6 waiting. Last season Wed May 20 to Sep 16.");
    expect(kendall.nextThree.map((d) => d.date)).toEqual(["2026-11-27", "2026-11-28", "2026-11-29"]);
  });

  it("says Spokane Saturday Market has no dates yet, and opens Add dates on its page", () => {
    const saturday = boardRowView(row("Spokane Saturday Market"), board.window, SNAPSHOT_NOW);
    expect(saturday.note).toBe("No dates yet.");
    expect(saturday.actions[0]).toEqual({ kind: "add", label: "Add dates", href: "/admin/markets/market-saturday?add=1" });
  });
});

describe("dates that repeat but have no market", () => {
  const groups = findRepeatsWithoutMarket(boardEvents, boardGroups, SNAPSHOT_NOW, board.claimed);

  it("finds the series without a market first, then last season's single listings", () => {
    expect(groups.slice(0, 3).map((g) => [g.name, g.description])).toEqual([
      ["Spokane Farmers' Market", "Saturdays Nov 7 to Nov 21 (and Oct 31, gone by), Coeur d'Alene Park, Pending"],
      ["A Very Merry Market", "4 weekends, Nov 27 to Dec 20, Silver Lake Mall, Pending"],
      ["German Christmas Market (Post Falls Public Market)", "4 weekends, Nov 27 to Dec 20, Post Falls Public Market, Draft"],
    ]);
    expect(groups[3]).toMatchObject({ name: "Millwood Farmers Market", description: "Wednesdays, last season", ended: true });
  });

  it("drafts the market from the dates and plans Millwood's 2027 season", () => {
    const merry = groups.find((g) => g.name === "A Very Merry Market")!;
    expect(merry.draft.typicalSchedule).toBe("Fridays to Sundays");
    const millwood = groups.find((g) => g.name === "Millwood Farmers Market")!;
    expect(millwood.draft.typicalSchedule).toBe("Wednesdays, 3:00 to 7:00 pm");
    expect(millwood.plan).toHaveLength(21);
    expect(describePlan(millwood.plan.map((p) => p.date), SNAPSHOT_NOW)).toBe("Wednesdays May 26 to Oct 13, 2027");
  });

  it("leaves out dates a market already claims as look-alikes", () => {
    expect(groups.some((g) => g.name.startsWith("Cabin Fever"))).toBe(false);
  });
});

describe("seasons on the market page", () => {
  it("splits Kendall Yards into Winter 2026 ahead and its one-listing Summer 2026", () => {
    const kendall = row("Kendall Yards Night Market");
    const seasons = seasonsOf(kendall.events, SNAPSHOT_NOW);
    expect(seasons.map((s) => [s.name, s.title, s.ended])).toEqual([
      ["Winter 2026", "Kendall Yards Christmas Market", false],
      ["Summer 2026", "Kendall Yards Night Market", true],
    ]);
    expect(seasons[1].summary).toBe("Wednesdays May 20 to Sep 16 (one listing)");
  });

  it("names seasons by their middle day", () => {
    expect(seasonName("2026-12-05")).toBe("Winter 2026");
    expect(seasonName("2027-01-13")).toBe("Winter 2026");
    expect(seasonName("2027-04-01")).toBe("Spring 2027");
    expect(seasonName("2026-07-18")).toBe("Summer 2026");
    expect(seasonName("2027-10-16")).toBe("Fall 2027");
  });
});

describe("buildLane", () => {
  it("counts dates beyond the window instead of drawing them", () => {
    const window = seasonWindow("2026-11-03");
    const late = { ...boardEvents[0], id: "late", startDate: new Date("2027-12-04T18:00:00Z"), endDate: new Date("2027-12-04T23:00:00Z"), status: "PENDING" };
    expect(buildLane([late], window, SNAPSHOT_NOW)).toMatchObject({ stalls: [], later: 1 });
  });
});
