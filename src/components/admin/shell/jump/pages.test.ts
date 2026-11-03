import { describe, expect, it } from "vitest";
import { JUMP_COMMANDS, JUMP_PAGES, availableCommands } from "./pages";

function findBy(word: string) {
  return JUMP_PAGES.filter((p) => p.label.toLowerCase().includes(word) || p.keywords.includes(word)).map((p) => p.id);
}

describe("Jump pages", () => {
  it("has unique ids and labels, all under /admin", () => {
    expect(new Set(JUMP_PAGES.map((p) => p.id)).size).toBe(JUMP_PAGES.length);
    expect(new Set(JUMP_PAGES.map((p) => p.label)).size).toBe(JUMP_PAGES.length);
    expect(JUMP_PAGES.every((p) => p.href.startsWith("/admin"))).toBe(true);
  });

  it("finds pages by the owner's words", () => {
    expect(findBy("permissions")).toContain("users");
    expect(findBy("banner")).toContain("site");
    expect(findBy("merge")).toContain("venue-duplicates");
    expect(findBy("tokens")).toContain("api-tokens");
  });
});

describe("availableCommands", () => {
  it("leaves out the current mode and the current shortcut setting", () => {
    const ids = availableCommands(JUMP_COMMANDS, { mode: "dark", singleKeys: true }).map((c) => c.id);
    expect(ids).not.toContain("mode-dark");
    expect(ids).toContain("mode-light");
    expect(ids).toContain("mode-system");
    expect(ids).toContain("keys-off");
    expect(ids).not.toContain("keys-on");
  });
});
