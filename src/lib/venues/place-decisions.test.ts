import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import venuesJson from "@/lib/admin/__fixtures__/venues.json";
import { snapshotDecisionInput } from "@/lib/admin/__fixtures__/snapshot";
import { buildDecisions } from "@/lib/admin/decisions";
import type { DecisionInput } from "@/lib/admin/decisions/types";
import { pairKey } from "@/lib/events/twins";
import { FIXTURE_NEIGHBORHOODS } from "./__fixtures__/neighborhoods";
import { spellingSummary, type DecisionInputWithNeighborhoods, type DecisionVenueWithUses } from "./place-decisions";

const usesById = new Map(venuesJson.map((v) => [v.id, { events: v._count.events, markets: v._count.markets }]));

/** The snapshot input with each place's event and market counts and the neighborhood list, as the loader supplies them. */
function withUses(input: DecisionInput): DecisionInputWithNeighborhoods {
  return { ...input, venues: input.venues.map((v): DecisionVenueWithUses => ({ ...v, uses: usesById.get(v.id) })), neighborhoods: FIXTURE_NEIGHBORHOODS };
}

const PLACE_KINDS = new Set(["place-duplicates", "zip-neighborhood", "spelling", "archived-in-use", "unused-places"]);

describe("place decisions", () => {
  it("files nothing for places whose usage the input does not carry", () => {
    const result = buildDecisions(snapshotDecisionInput({ backfill: true }));
    expect(result.decisions.filter((d) => PLACE_KINDS.has(d.kind))).toEqual([]);
  });

  const result = buildDecisions(withUses(snapshotDecisionInput({ backfill: true })));
  const places = result.decisions.filter((d) => d.lane === "places");

  it("files every place decision in the places lane, settling no event", () => {
    expect(places.length).toBeGreaterThan(0);
    expect(places.every((d) => PLACE_KINDS.has(d.kind) && d.settles.length === 0)).toBe(true);
    expect(result.decisions.filter((d) => PLACE_KINDS.has(d.kind)).every((d) => d.lane === "places")).toBe(true);
    expect(result.lanes.find((l) => l.lane === "places")!.waiting).toBe(places.length);
  });

  it("makes one decision per duplicate group, merging with the defaults", () => {
    const groups = places.filter((d) => d.kind === "place-duplicates");
    expect(groups).toHaveLength(15);
    const scc = groups.find((d) => d.title === "Spokane Community College, The Lair, 3 records")!;
    expect(scc.primary).toEqual({ label: "Merge 3 into one", action: "merge" });
    expect(scc.rows.every((r) => r.type === "venue")).toBe(true);
    expect(scc.key).toBe(`place-duplicates:${scc.rows.map((r) => r.id).sort().join("|")}`);
    expect(scc.firstDate).toBe("2026-11-07");
  });

  it("puts places hosting something this weekend first in the lane", () => {
    const dated = places.filter((d) => d.firstDate);
    expect(dated[0].firstDate! <= "2026-11-08").toBe(true);
  });

  it("makes one decision per ZIP of places without a neighborhood", () => {
    const zips = places.filter((d) => d.kind === "zip-neighborhood");
    expect(zips.reduce((n, d) => n + d.rows.length, 0)).toBe(72);
    expect(new Set(zips.map((d) => d.key)).size).toBe(zips.length);
    const cda = zips.find((d) => d.key === "zip-neighborhood:83814")!;
    expect(cda.primary).toEqual({ label: `Set for ${cda.rows.length}`, action: "set-neighborhood" });
  });

  it("labels each ZIP with what P does in its pane", () => {
    const zip = (code: string) => places.find((d) => d.key === `zip-neighborhood:${code}`)!.primary.label;
    expect(zip("99201")).toBe("Pick for 6");
    expect(zip("83854")).toBe('Add "Post Falls" and set for 7');
    expect(zip("83815")).toBe("Set for 3");
  });

  it("files no ZIP decision without the neighborhood list", () => {
    const input = { ...withUses(snapshotDecisionInput({ backfill: true })), neighborhoods: undefined };
    expect(buildDecisions(input).decisions.filter((d) => d.kind === "zip-neighborhood")).toEqual([]);
  });

  it("gathers spelling, unused places and archived places in use", () => {
    expect(places.find((d) => d.kind === "spelling")).toMatchObject({ key: "spelling", title: "Spelling on 7 places", primary: { label: "Fix 7" } });
    expect(places.find((d) => d.kind === "spelling")!.detail).toMatch(/^Wa to WA on 4, /);
    expect(places.find((d) => d.kind === "unused-places")).toMatchObject({
      key: "unused-places",
      title: "10 places nothing uses",
      detail: "Mirabeau Point Park and Trackside Studio Ceramic Art Gallery. 8 more are left to merging.",
      primary: { label: "Archive 2", action: "archive" },
    });
    const archived = places.filter((d) => d.kind === "archived-in-use");
    expect(archived.map((d) => d.title)).toEqual(["University High School: archived, still in use"]);
    expect(archived[0].detail).toBe("1 market");
    expect(archived[0].primary).toEqual({ label: "Move its listings to University High School", action: "merge" });
  });

  it("names each kind of spelling fix once, most common first", () => {
    const row = (...fixes: [string, string][]) => ({ place: {} as never, fixes: fixes.map(([before, after]) => ({ field: "city" as const, before, after })) });
    expect(
      spellingSummary([row(["Wa", "WA"]), row(["Wa", "WA"], ["SPOKANE", "Spokane"]), row(["Post Falles", "Post Falls"]), row(["Wa", "WA"])])
    ).toBe("Wa to WA on 3, SPOKANE to Spokane and Post Falles to Post Falls");
    expect(spellingSummary([row(["Wa", "WA"]), row(["Idaho", "ID"]), row(["SPOKANE", "Spokane"]), row(["Post Falles", "Post Falls"])])).toBe(
      "Wa to WA, Idaho to ID and 2 more"
    );
  });

  it("drops a group the owner marked as different places", () => {
    const input = withUses(snapshotDecisionInput({ backfill: true }));
    const scc = places.find((d) => d.title === "Spokane Community College, The Lair, 3 records")!;
    const ids = scc.rows.map((r) => r.id);
    const memos = [pairKey(ids[0], ids[1]), pairKey(ids[0], ids[2]), pairKey(ids[1], ids[2])].map((key) => ({ kind: "not-same-place", key, until: null }));
    const after = buildDecisions({ ...input, memos }).decisions.filter((d) => d.kind === "place-duplicates");
    expect(after).toHaveLength(14);
  });
});
