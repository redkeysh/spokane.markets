"use client";

import { createContext, useContext, useEffect, useRef, type RefObject } from "react";

/**
 * Whether single-character shortcuts are on (the sm_admin_keys preference, WCAG 2.1.4).
 * When off, only Ctrl or Cmd combinations and non-character keys (arrows, Escape) work.
 */
export const SingleKeysContext = createContext<boolean>(true);

/**
 * Key specs: "p", "shift+l", "?", "/", "[", "mod+k" (Ctrl or Cmd), "ctrl+z", "alt+arrowdown",
 * "mod+enter", "escape", "home", "space", "shift+1", and two-key sequences such as "g t".
 */
export type ShortcutMap = Record<string, (event: KeyboardEvent) => void>;

export type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
> & { target: EventTarget | null };

type Combo = { key: string; mod: boolean; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };

const SEQUENCE_TIMEOUT_MS = 1500;

const KEY_ALIASES: Record<string, string> = {
  space: " ",
  esc: "escape",
  down: "arrowdown",
  up: "arrowup",
  left: "arrowleft",
  right: "arrowright",
};

export function parseCombo(spec: string): Combo {
  const parts = spec.toLowerCase().split("+");
  // "shift++" style specs do not occur; a trailing empty part means the key itself is "+".
  const rawKey = parts.pop() || "+";
  const key = KEY_ALIASES[rawKey] ?? rawKey;
  return {
    key,
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    meta: parts.includes("meta"),
  };
}

/** A key that types into a text field: a printable character or Space, with no Ctrl, Cmd or Alt. */
function typesText(c: Combo): boolean {
  return !c.mod && !c.ctrl && !c.alt && !c.meta && c.key.length === 1;
}

/**
 * A letter, digit, punctuation or symbol key with no Ctrl, Cmd or Alt: the kind WCAG 2.1.4 lets
 * people turn off. Space is not one.
 */
export function isSingleCharacter(spec: string): boolean {
  return spec.split(" ").some((step) => {
    const c = parseCombo(step);
    return typesText(c) && c.key !== " ";
  });
}

/** Text fields, selects and contenteditable regions swallow single keys. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"].includes(type);
  }
  return el.closest("[contenteditable=''], [contenteditable='true'], [role='textbox'], [role='combobox']") !== null;
}

function isLetter(key: string): boolean {
  return key.length === 1 && key.toLowerCase() !== key.toUpperCase();
}

export function matchesCombo(combo: Combo, event: KeyEventLike): boolean {
  const ctrlOrMeta = event.ctrlKey || event.metaKey;
  if (combo.mod) {
    if (!ctrlOrMeta) return false;
  } else {
    if (combo.ctrl !== event.ctrlKey || combo.meta !== event.metaKey) return false;
  }
  if (combo.alt !== event.altKey) return false;

  const pressed = event.key.toLowerCase();
  if (/^[0-9]$/.test(combo.key)) {
    return event.code === `Digit${combo.key}` && combo.shift === event.shiftKey;
  }
  if (combo.key.length === 1 && !isLetter(combo.key)) {
    // Symbols such as "?" are typed with Shift on most layouts, so Shift is not compared.
    return pressed === combo.key;
  }
  return pressed === combo.key && combo.shift === event.shiftKey;
}

export type ShortcutResolution = { kind: "fire"; spec: string } | { kind: "prefix"; prefix: string } | null;

/**
 * Decides what a keydown does against the bound specs: fire a binding, start a sequence such as
 * "g" of "g t", or nothing.
 */
export function resolveShortcut(
  specs: readonly string[],
  event: KeyEventLike,
  { singleKeys, prefix }: { singleKeys: boolean; prefix: string | null }
): ShortcutResolution {
  const typing = isTypingTarget(event.target);
  const allowed = (spec: string) => {
    if (typing && spec.split(" ").some((step) => typesText(parseCombo(step)))) return false;
    return singleKeys || !isSingleCharacter(spec);
  };

  if (prefix) {
    for (const spec of specs) {
      const steps = spec.split(" ");
      if (steps.length === 2 && steps[0] === prefix && allowed(spec) && matchesCombo(parseCombo(steps[1]), event)) {
        return { kind: "fire", spec };
      }
    }
  }

  for (const spec of specs) {
    const steps = spec.split(" ");
    if (!allowed(spec)) continue;
    if (steps.length === 1 && matchesCombo(parseCombo(steps[0]), event)) return { kind: "fire", spec };
  }

  for (const spec of specs) {
    const steps = spec.split(" ");
    if (steps.length === 2 && allowed(spec) && matchesCombo(parseCombo(steps[0]), event)) {
      return { kind: "prefix", prefix: steps[0] };
    }
  }
  return null;
}

/**
 * Binds keyboard shortcuts on the document, or on `scope` when given. Bindings are read fresh on
 * every keydown, so the map can be recreated on each render. Keys pressed inside an open modal
 * dialog are ignored unless the scope is inside that dialog.
 */
export function useShortcuts(
  bindings: ShortcutMap,
  { enabled = true, scope }: { enabled?: boolean; scope?: RefObject<HTMLElement | null> } = {}
) {
  const singleKeys = useContext(SingleKeysContext);
  const latest = useRef(bindings);

  useEffect(() => {
    latest.current = bindings;
  });

  useEffect(() => {
    if (!enabled) return;
    const target: HTMLElement | Document = scope?.current ?? document;
    let prefix: string | null = null;
    let prefixUntil = 0;

    const onKeyDown = (event: Event) => {
      const e = event as KeyboardEvent;
      if (e.defaultPrevented || e.isComposing) return;
      const openDialog = (e.target as Element | null)?.closest?.("dialog[open]");
      if (openDialog && !(scope?.current && openDialog.contains(scope.current))) return;

      const now = Date.now();
      if (prefix && now > prefixUntil) prefix = null;
      const result = resolveShortcut(Object.keys(latest.current), e, { singleKeys, prefix });
      prefix = null;
      if (!result) return;
      if (result.kind === "prefix") {
        prefix = result.prefix;
        prefixUntil = now + SEQUENCE_TIMEOUT_MS;
        return;
      }
      e.preventDefault();
      latest.current[result.spec]?.(e);
    };

    target.addEventListener("keydown", onKeyDown);
    return () => target.removeEventListener("keydown", onKeyDown);
  }, [enabled, singleKeys, scope]);
}
