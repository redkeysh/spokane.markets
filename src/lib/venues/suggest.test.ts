import { describe, expect, it } from "vitest";
import { suggestQueryWords } from "./suggest";

describe("suggestQueryWords", () => {
  it("splits a trimmed query into at most five words", () => {
    expect(suggestQueryWords("  fair   expo ")).toEqual(["fair", "expo"]);
    expect(suggestQueryWords("a b c d e f g")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns no words below the minimum length", () => {
    expect(suggestQueryWords(" s ")).toEqual([]);
  });
});
