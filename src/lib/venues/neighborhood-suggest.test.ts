import { describe, expect, it } from "vitest";
import { FIXTURE_NEIGHBORHOODS } from "./__fixtures__/neighborhoods";
import { fixturePlaces } from "./__fixtures__/places";
import { nameTownNote, neighborhoodBuckets, proposalFor, suggestNeighborhood, type SuggestablePlace } from "./neighborhood-suggest";

const NEIGHBORHOODS = FIXTURE_NEIGHBORHOODS;

const at = (zip: string, city: string, extra: Partial<SuggestablePlace> = {}): SuggestablePlace => ({
  id: `${zip}-${city}-${extra.name ?? "x"}`,
  name: "A Place",
  address: "1 Main St",
  city,
  state: "WA",
  zip,
  neighborhood: null,
  ...extra,
});

describe("suggestNeighborhood", () => {
  it("offers two choices for a ZIP that straddles two neighborhoods", () => {
    expect(suggestNeighborhood(at("99201", "Spokane"), [], NEIGHBORHOODS)).toEqual({ bucket: "pick", candidates: ["downtown", "kendall-yards"] });
  });

  it("follows what at least two other places in the ZIP use", () => {
    const others = [at("99216", "Spokane Valley", { id: "a", neighborhood: "spokane-valley" }), at("99216", "Spokane Valley", { id: "b", neighborhood: "spokane-valley" })];
    expect(suggestNeighborhood(at("99216", "Spokane Valley"), others, NEIGHBORHOODS)).toEqual({
      bucket: "sure",
      slug: "spokane-valley",
      source: "zip-majority",
      usedBy: 2,
    });
  });

  it("prefers a ZIP inside one neighborhood over a single other place's choice", () => {
    const one = [at("99205", "Spokane", { id: "a", neighborhood: "emerson-garfield" })];
    expect(suggestNeighborhood(at("99205", "Spokane"), one, NEIGHBORHOODS)).toEqual({ bucket: "sure", slug: "garland", source: "zip" });
  });

  it("finds the neighborhood that names the town, including the cda slug", () => {
    expect(suggestNeighborhood(at("99021", "Mead", { zip: "" }), [], NEIGHBORHOODS)).toEqual({ bucket: "sure", slug: "north-spokane", source: "city" });
    expect(suggestNeighborhood(at("83814", "Coeur d'Alene", { state: "ID" }), [], NEIGHBORHOODS)).toEqual({ bucket: "sure", slug: "cda", source: "city" });
  });

  it("proposes a neighborhood to add when none fits, and never adds it", () => {
    expect(suggestNeighborhood(at("83854", "Post Falls", { state: "ID" }), [], NEIGHBORHOODS)).toEqual({
      bucket: "none",
      proposal: { label: "Post Falls", slug: "post-falls" },
    });
    expect(proposalFor(at("83858", "Rathdrum"))).toEqual({ label: "North Idaho", slug: "north-idaho" });
    expect(proposalFor(at("99109", "Chewelah"))).toEqual({ label: "North of Spokane", slug: "north-of-spokane" });
  });

  it("uses a proposed neighborhood once the owner has added it", () => {
    const withIdaho = [...NEIGHBORHOODS, { slug: "north-idaho", label: "North Idaho", isActive: true }];
    expect(suggestNeighborhood(at("83801", "Athol", { state: "ID" }), [], withIdaho)).toEqual({ bucket: "sure", slug: "north-idaho", source: "city" });
  });

  it("never proposes Spokane itself: a Spokane place with an unknown ZIP is picked by hand", () => {
    expect(suggestNeighborhood(at("99022", "Spokane"), [], NEIGHBORHOODS)).toEqual({ bucket: "none", proposal: { label: "Medical Lake", slug: "medical-lake" } });
    expect(suggestNeighborhood(at("99299", "Spokane"), [], NEIGHBORHOODS)).toEqual({ bucket: "pick", candidates: [] });
  });

  it("ignores turned-off neighborhoods", () => {
    const off = NEIGHBORHOODS.map((n) => (n.slug === "kendall-yards" ? { ...n, isActive: false } : n));
    expect(suggestNeighborhood(at("99201", "Spokane"), [], off)).toEqual({ bucket: "sure", slug: "downtown", source: "zip" });
  });
});

describe("nameTownNote", () => {
  it("notes a name that holds another town", () => {
    expect(nameTownNote({ name: "Coeur d'Alene Park", city: "Spokane" })).toBe("Its name says Coeur d'Alene; it is in Spokane.");
  });

  it("stays quiet when the name holds the place's own town or a part of it", () => {
    expect(nameTownNote({ name: "Spokane Valley Mall", city: "Spokane Valley" })).toBeNull();
    expect(nameTownNote({ name: "Spokane County Fair & Expo Center", city: "Spokane Valley" })).toBeNull();
    expect(nameTownNote({ name: "Post Falls City Hall", city: "Post Falls" })).toBeNull();
  });
});

describe("neighborhoodBuckets on the 2026-11-03 snapshot", () => {
  const places = fixturePlaces().filter((p) => !p.deletedAt);
  const asRow = (p: (typeof places)[number]): SuggestablePlace => ({ ...p, nextDate: p.next?.date ?? null });
  const missing = places.filter((p) => !p.neighborhood).map(asRow);
  const buckets = neighborhoodBuckets(missing, places.map(asRow), NEIGHBORHOODS);
  const sure = buckets.sure.reduce((n, g) => n + g.places.length, 0);
  const none = buckets.none.reduce((n, g) => n + g.places.length, 0);

  it("files all 72 places without a neighborhood into exactly one bucket", () => {
    expect(buckets.total).toBe(72);
    expect(sure + buckets.pick.length + none).toBe(72);
  });

  it("groups the sure ones by ZIP and orders groups by the next event there", () => {
    expect(buckets.sure.every((g) => g.places.every((p) => p.zip.startsWith(g.zip)))).toBe(true);
    const firsts = buckets.sure.map((g) => g.places[0].nextDate ?? "9999");
    expect([...firsts].sort()).toEqual(firsts);
  });

  it("proposes Post Falls, North Idaho and North of Spokane for the towns no neighborhood fits", () => {
    const labels = new Map(buckets.none.map((g) => [g.proposal.label, g]));
    expect(labels.get("Post Falls")?.places).toHaveLength(7);
    expect(labels.get("North Idaho")?.towns).toEqual(["Rathdrum", "Athol", "Spirit Lake", "Blanchard"]);
    expect(labels.get("North of Spokane")?.towns).toEqual(expect.arrayContaining(["Chewelah", "Colbert", "Addy", "Newport"]));
  });

  it("asks which of two for Coeur d'Alene Park, with the note about its name", () => {
    const row = buckets.pick.find((r) => r.place.name === "Coeur d'Alene Park")!;
    expect(row.candidates).toEqual(["downtown", "kendall-yards"]);
    expect(row.note).toBe("Its name says Coeur d'Alene; it is in Spokane.");
  });
});
