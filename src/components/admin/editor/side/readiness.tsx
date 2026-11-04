"use client";

import * as React from "react";
import { missingVenueParts, pictureIsWebPage } from "@/lib/events/readiness";
import { cn } from "@/lib/utils";
import { SideSection } from "../editor-shell";
import { useEditorForm } from "../form-context";
import { dayProblems, type EditorValues, type Stretch } from "../model";
import { goToSection } from "../section-links";
import type { EditorOptions } from "../types";

export type ReadinessItem = { label: string; state: string; tone: "done" | "missing" | "info"; section?: string };

/** What is done and what is missing before the listing goes live, from the held values. */
export function readinessItems(
  values: EditorValues,
  options: EditorOptions,
  ctx: { mode: string; stretch: Stretch | null }
): ReadinessItem[] {
  const days = values.days;
  const datesOk = days.length > 0 ? days.every((d) => !dayProblems(d).some((p) => p.kind === "error")) : !!ctx.stretch;
  let placeState: { ok: boolean; text: string };
  if (ctx.mode === "submission") {
    const missing = missingVenueParts(values.place);
    placeState = missing.length ? { ok: false, text: `No ${missing[0]}` } : { ok: true, text: "Done" };
  } else {
    const place = options.places.find((p) => p.id === values.venueId);
    if (place) {
      const missing = missingVenueParts(place);
      placeState = place.archived ? { ok: false, text: "Archived place" } : missing.length ? { ok: false, text: `No ${missing[0]}` } : { ok: true, text: "Done" };
    } else if (values.place.name && values.place.address) {
      const missing = missingVenueParts(values.place);
      placeState = missing.length ? { ok: false, text: `No ${missing[0]}` } : { ok: true, text: "New place" };
    } else {
      placeState = { ok: false, text: "No place" };
    }
  }
  const items: ReadinessItem[] = [];
  items.push(
    !datesOk
      ? { label: "Date and place", state: "Check the dates", tone: "missing", section: "when" }
      : placeState.ok
        ? { label: "Date and place", state: placeState.text, tone: "done" }
        : { label: "Date and place", state: placeState.text, tone: "missing", section: "where" }
  );
  const hoursCheck = days.some((d) => dayProblems(d).length > 0);
  items.push(
    days.length === 0 && ctx.stretch
      ? { label: "Daily hours", state: "Missing", tone: "missing", section: "when" }
      : hoursCheck
        ? { label: "Daily hours", state: "Check", tone: "missing", section: "when" }
        : { label: "Daily hours", state: "Done", tone: "done" }
  );
  items.push(
    !values.imageUrl
      ? { label: "Picture", state: "Missing", tone: "missing", section: "picture" }
      : pictureIsWebPage(values.imageUrl)
        ? { label: "Picture", state: "A web page", tone: "missing", section: "picture" }
        : { label: "Picture", state: "Done", tone: "done" }
  );
  items.push(
    values.tagIds.length
      ? { label: "Tags", state: String(values.tagIds.length), tone: "done" }
      : { label: "Tags", state: "Missing", tone: "missing", section: "tags-and-features" }
  );
  items.push(
    values.featureIds.length
      ? { label: "Features", state: String(values.featureIds.length), tone: "done" }
      : { label: "Features", state: "Missing", tone: "missing", section: "tags-and-features" }
  );
  const market = options.markets.find((m) => m.id === values.marketId);
  items.push({ label: "Market", state: market ? (market.archived ? `${market.name} (archived)` : market.name) : "None", tone: "info" });
  return items;
}

/** "Before it goes live": each missing item links to its section. */
export function ReadinessPanel() {
  const { values, options, mode, context, record } = useEditorForm();
  const items = readinessItems(values, options, { mode, stretch: context.stretch });
  const live = record.status === "PUBLISHED";
  return (
    <SideSection title={live ? "What visitors see" : "Before it goes live"}>
      <dl className="divide-y divide-seam">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4 py-1.5">
            <dt className="text-sm text-basalt">{item.label}</dt>
            <dd className={cn("min-w-0 text-right text-sm tabular-nums", item.tone === "missing" ? "text-honey-ink" : item.tone === "done" ? "text-basalt" : "text-ash")}>
              {item.section ? (
                <a
                  href={`#${item.section}`}
                  onClick={(e) => {
                    e.preventDefault();
                    goToSection(item.section!);
                  }}
                  className="rounded-sm font-medium underline underline-offset-4"
                >
                  {item.state}
                </a>
              ) : (
                <span className="block truncate" title={item.state}>
                  {item.state}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </SideSection>
  );
}
