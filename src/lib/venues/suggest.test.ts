import { describe, expect, it } from "vitest";
import { rankVenueSuggestions, suggestQueryWords } from "./suggest";

describe("suggestQueryWords", () => {
  it("splits a trimmed query into at most five words", () => {
    expect(suggestQueryWords("  fair   expo ")).toEqual(["fair", "expo"]);
    expect(suggestQueryWords("a b c d e f g")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns no words below the minimum length", () => {
    expect(suggestQueryWords(" s ")).toEqual([]);
  });
});

describe("rankVenueSuggestions", () => {
  const names = (list: { name: string }[]) => list.map((v) => v.name);

  it("puts name-prefix matches first, then sorts by name", () => {
    const venues = [{ name: "The Shrine Hall" }, { name: "Shriners Event Center" }, { name: "Coeur d'Alene Shrine" }];
    expect(names(rankVenueSuggestions(venues, "shri"))).toEqual([
      "Shriners Event Center",
      "Coeur d'Alene Shrine",
      "The Shrine Hall",
    ]);
  });

  it("returns at most the limit", () => {
    const venues = Array.from({ length: 10 }, (_, i) => ({ name: `Hall ${i}` }));
    expect(rankVenueSuggestions(venues, "hall")).toHaveLength(6);
  });
});
