"use client";

import * as React from "react";
import { SECTION_LINK } from "@/components/admin/kit/section-link";
import { OPEN_SECTION_EVENT } from "./collapsible-section";
import { EditorSelect } from "./controls";

export type SectionLink = { id: string; label: string };

/** Moves to a section heading and gives it focus, so keyboard and screen reader users land there too. */
export function goToSection(id: string) {
  window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: id }));
  const section = document.getElementById(id);
  if (!section) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  section.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "instant" });
  const heading = section.querySelector<HTMLElement>("h2");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

/**
 * In-page links to every section, not tabs: nothing is ever hidden. On phones they become a
 * "Go to section" select.
 */
export function SectionLinks({ links }: { links: SectionLink[] }) {
  const selectId = React.useId();
  return (
    <>
      <nav aria-label="Sections" className="mt-3 hidden md:block">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {links.map((link) => (
            <li key={link.id}>
              <a
                href={`#${link.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  goToSection(link.id);
                }}
                className={SECTION_LINK}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mt-3 md:hidden">
        <label htmlFor={selectId} className="sr-only">
          Go to section
        </label>
        <EditorSelect
          id={selectId}
          value=""
          onChange={(e) => {
            if (e.target.value) goToSection(e.target.value);
          }}
        >
          <option value="">Go to section</option>
          {links.map((link) => (
            <option key={link.id} value={link.id}>
              {link.label}
            </option>
          ))}
        </EditorSelect>
      </div>
    </>
  );
}
