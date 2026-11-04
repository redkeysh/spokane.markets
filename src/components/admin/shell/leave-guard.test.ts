import { describe, expect, it } from "vitest";
import { clickedHref } from "./leave-guard";

const HERE = new URL("http://localhost:3000/admin/events/e1?from=events");

type FakeLink = { href: string; target: string; download?: boolean; leaveOk?: boolean };

function click(link: FakeLink | null, init: Partial<MouseEvent> = {}): MouseEvent {
  const anchor = link && {
    href: new URL(link.href, HERE).href,
    target: link.target,
    hasAttribute: (name: string) => name === "download" && !!link.download,
    closest: (selector: string) => (selector === "[data-leave-ok]" && link.leaveOk ? anchor : null),
  };
  const target = { closest: (selector: string) => (selector === "a[href]" ? anchor : null) };
  return { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, target, ...init } as unknown as MouseEvent;
}

describe("clickedHref", () => {
  it("names the admin address a plain click on a link opens", () => {
    expect(clickedHref(click({ href: "/admin/markets", target: "" }), HERE)).toBe("/admin/markets");
    expect(clickedHref(click({ href: "/admin/events?week=2026-11-07#x", target: "_self" }), HERE)).toBe("/admin/events?week=2026-11-07#x");
  });

  it("lets clicks through that open nothing in this tab", () => {
    expect(clickedHref(click(null), HERE)).toBeNull();
    expect(clickedHref(click({ href: "/admin", target: "" }, { metaKey: true }), HERE)).toBeNull();
    expect(clickedHref(click({ href: "/admin", target: "" }, { button: 1 }), HERE)).toBeNull();
    expect(clickedHref(click({ href: "/", target: "_blank" }), HERE)).toBeNull();
    expect(clickedHref(click({ href: "/admin/data/export", target: "", download: true }), HERE)).toBeNull();
    expect(clickedHref(click({ href: "https://example.com/admin", target: "" }), HERE)).toBeNull();
    expect(clickedHref(click({ href: "/admin", target: "" }, { defaultPrevented: true }), HERE)).toBeNull();
  });

  it("lets hash links and links that ask for themselves through", () => {
    expect(clickedHref(click({ href: "/admin/events/e1?from=events#where", target: "" }), HERE)).toBeNull();
    expect(clickedHref(click({ href: "/admin?d=x", target: "", leaveOk: true }), HERE)).toBeNull();
  });
});
