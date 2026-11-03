import { describe, expect, it } from "vitest";
import {
  isSingleCharacter,
  isTypingTarget,
  matchesCombo,
  parseCombo,
  resolveShortcut,
  type KeyEventLike,
} from "./use-shortcuts";
import { nextRovingIndex, rovingMoveFor } from "./use-roving";

function fakeElement(tagName: string, extra: Record<string, unknown> = {}) {
  return {
    tagName,
    isContentEditable: false,
    closest: () => null,
    ...extra,
  } as unknown as EventTarget;
}

const BODY = fakeElement("BODY");

function key(k: string, extra: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key: k,
    code: /^[0-9]$/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: BODY,
    ...extra,
  };
}

describe("isTypingTarget", () => {
  it("treats text inputs, textareas, selects and contenteditable as typing", () => {
    expect(isTypingTarget(fakeElement("INPUT", { type: "text" }))).toBe(true);
    expect(isTypingTarget(fakeElement("INPUT", { type: "search" }))).toBe(true);
    expect(isTypingTarget(fakeElement("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(fakeElement("SELECT"))).toBe(true);
    expect(isTypingTarget(fakeElement("DIV", { isContentEditable: true }))).toBe(true);
  });

  it("lets keys through on checkboxes, buttons and plain elements", () => {
    expect(isTypingTarget(fakeElement("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isTypingTarget(fakeElement("BUTTON"))).toBe(false);
    expect(isTypingTarget(BODY)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("treats an element inside a combobox as typing", () => {
    expect(isTypingTarget(fakeElement("SPAN", { closest: () => ({}) }))).toBe(true);
  });
});

describe("isSingleCharacter", () => {
  it("flags printable keys without Ctrl, Cmd or Alt", () => {
    expect(isSingleCharacter("p")).toBe(true);
    expect(isSingleCharacter("shift+l")).toBe(true);
    expect(isSingleCharacter("?")).toBe(true);
    expect(isSingleCharacter("g t")).toBe(true);
  });

  it("does not flag combinations or non-character keys", () => {
    expect(isSingleCharacter("mod+k")).toBe(false);
    expect(isSingleCharacter("ctrl+z")).toBe(false);
    expect(isSingleCharacter("alt+arrowdown")).toBe(false);
    expect(isSingleCharacter("escape")).toBe(false);
    expect(isSingleCharacter("arrowdown")).toBe(false);
  });

  it("does not flag Space, which is not a character key under WCAG 2.1.4", () => {
    expect(isSingleCharacter("space")).toBe(false);
    expect(isSingleCharacter("shift+space")).toBe(false);
  });
});

describe("matchesCombo", () => {
  it("compares Shift for letters", () => {
    expect(matchesCombo(parseCombo("l"), key("l"))).toBe(true);
    expect(matchesCombo(parseCombo("l"), key("L", { shiftKey: true }))).toBe(false);
    expect(matchesCombo(parseCombo("shift+l"), key("L", { shiftKey: true }))).toBe(true);
  });

  it("ignores Shift for symbols typed with it", () => {
    expect(matchesCombo(parseCombo("?"), key("?", { shiftKey: true }))).toBe(true);
  });

  it("matches mod to Ctrl or Cmd", () => {
    expect(matchesCombo(parseCombo("mod+k"), key("k", { ctrlKey: true }))).toBe(true);
    expect(matchesCombo(parseCombo("mod+k"), key("k", { metaKey: true }))).toBe(true);
    expect(matchesCombo(parseCombo("mod+k"), key("k"))).toBe(false);
  });

  it("matches digits by code so Shift+1 works on any layout", () => {
    expect(matchesCombo(parseCombo("shift+1"), key("!", { code: "Digit1", shiftKey: true }))).toBe(true);
    expect(matchesCombo(parseCombo("1"), key("1"))).toBe(true);
    expect(matchesCombo(parseCombo("1"), key("!", { code: "Digit1", shiftKey: true }))).toBe(false);
  });
});

describe("resolveShortcut", () => {
  const specs = ["/", "mod+k", "?", "g t", "g e", "n", "escape"];

  it("fires single keys on the page", () => {
    expect(resolveShortcut(specs, key("n"), { singleKeys: true, prefix: null })).toEqual({ kind: "fire", spec: "n" });
  });

  it("never fires single keys while typing, but still fires Ctrl combinations", () => {
    const input = fakeElement("INPUT", { type: "text" });
    expect(resolveShortcut(specs, key("n", { target: input }), { singleKeys: true, prefix: null })).toBeNull();
    expect(resolveShortcut(specs, key("k", { ctrlKey: true, target: input }), { singleKeys: true, prefix: null })).toEqual({
      kind: "fire",
      spec: "mod+k",
    });
  });

  it("turns every single key off with the preference, keeping combinations and Escape", () => {
    expect(resolveShortcut(specs, key("/"), { singleKeys: false, prefix: null })).toBeNull();
    expect(resolveShortcut(specs, key("g"), { singleKeys: false, prefix: null })).toBeNull();
    expect(resolveShortcut(specs, key("k", { metaKey: true }), { singleKeys: false, prefix: null })).toEqual({
      kind: "fire",
      spec: "mod+k",
    });
    expect(resolveShortcut(specs, key("Escape"), { singleKeys: false, prefix: null })).toEqual({
      kind: "fire",
      spec: "escape",
    });
  });

  it("keeps Space on with the preference off, but never takes it from a text field", () => {
    const space = (extra: Partial<KeyEventLike> = {}) => key(" ", { code: "Space", ...extra });
    expect(resolveShortcut(["space"], space(), { singleKeys: false, prefix: null })).toEqual({ kind: "fire", spec: "space" });
    const input = fakeElement("INPUT", { type: "text" });
    expect(resolveShortcut(["space"], space({ target: input }), { singleKeys: true, prefix: null })).toBeNull();
  });

  it("runs two-key sequences", () => {
    expect(resolveShortcut(specs, key("g"), { singleKeys: true, prefix: null })).toEqual({ kind: "prefix", prefix: "g" });
    expect(resolveShortcut(specs, key("e"), { singleKeys: true, prefix: "g" })).toEqual({ kind: "fire", spec: "g e" });
    expect(resolveShortcut(specs, key("x"), { singleKeys: true, prefix: "g" })).toBeNull();
  });
});

describe("roving focus", () => {
  it("moves with arrows always and with j / k only when single keys are on", () => {
    const plain = { ctrlKey: false, metaKey: false, altKey: false };
    expect(rovingMoveFor({ key: "ArrowDown", ...plain }, { singleKeys: false })).toBe("next");
    expect(rovingMoveFor({ key: "j", ...plain }, { singleKeys: true })).toBe("next");
    expect(rovingMoveFor({ key: "J", ...plain }, { singleKeys: true })).toBe("next");
    expect(rovingMoveFor({ key: "j", ...plain }, { singleKeys: false })).toBeNull();
    expect(rovingMoveFor({ key: "k", ...plain, ctrlKey: true }, { singleKeys: true })).toBeNull();
    expect(rovingMoveFor({ key: "ArrowRight", ...plain }, { singleKeys: true, orientation: "horizontal" })).toBe("next");
  });

  it("clamps at both ends", () => {
    expect(nextRovingIndex(0, "previous", 5)).toBe(0);
    expect(nextRovingIndex(4, "next", 5)).toBe(4);
    expect(nextRovingIndex(2, "first", 5)).toBe(0);
    expect(nextRovingIndex(2, "last", 5)).toBe(4);
    expect(nextRovingIndex(0, "next", 0)).toBe(-1);
  });
});
