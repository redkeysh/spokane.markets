import { describe, expect, it } from "vitest";
import { listSome, listWords } from "./words";

describe("listWords", () => {
  it("joins with commas and a final and", () => {
    expect(listWords(["a"])).toBe("a");
    expect(listWords(["a", "b"])).toBe("a and b");
    expect(listWords(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("listSome", () => {
  it("names every item up to the limit", () => {
    expect(listSome(["a", "b", "c"])).toBe("a, b and c");
  });

  it("counts the rest past the limit", () => {
    expect(listSome(["a", "b", "c", "d"])).toBe("a, b and 2 more");
    expect(listSome(["a", "b", "c"], 2)).toBe("a and 2 more");
  });
});
