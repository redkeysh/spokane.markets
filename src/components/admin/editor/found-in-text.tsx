"use client";

import * as React from "react";
import { findFacts, parseMonthDay, type DescriptionFact } from "@/lib/events/description-facts";
import { useEditorForm } from "./form-context";
import { makeDay, type EditorValues } from "./model";

type Suggestion = { key: string; label: string; apply?: (values: EditorValues) => Partial<EditorValues> | null; note?: boolean };

function removeSentence(description: string, sentence: string): string {
  return description
    .replace(sentence, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;])/g, "$1")
    .trim();
}

/** A deadline written without a year ("Dec 1"), in the event's year, or the year before when that falls after the event. */
function deadlineDate(text: string, dates: { first: string; last: string }): string | null {
  const year = Number(dates.first.slice(0, 4));
  if (!year) return null;
  const date = parseMonthDay(text, year);
  return date && date > dates.last ? parseMonthDay(text, year - 1) : date;
}

/**
 * Turns what description-facts found into suggestions; each changes held values only when
 * clicked. With `current`, a suggestion the held values already carry is left out; with `dates`
 * (the event's first and last dates), a deadline without a year gets one.
 */
export function suggestionsFor(
  facts: DescriptionFact[],
  ctx: {
    mode: string;
    features: { id: string; name: string; slug: string }[];
    current?: Pick<EditorValues, "featureIds" | "details">;
    dates?: { first: string; last: string } | null;
  }
): Suggestion[] {
  const freeFeature = ctx.features.find((f) => f.slug === "free-admission" || /free admission/i.test(f.name));
  const details = ctx.current?.details;
  const out: Suggestion[] = [];
  facts.forEach((fact, i) => {
    const key = `${fact.kind}-${i}`;
    switch (fact.kind) {
      case "free-admission":
        if (freeFeature && !ctx.current?.featureIds.includes(freeFeature.id)) {
          out.push({
            key,
            label: `Free admission: add ${freeFeature.name}`,
            apply: (v) => (v.featureIds.includes(freeFeature.id) ? null : { featureIds: [...v.featureIds, freeFeature.id] }),
          });
        }
        break;
      case "admission-price":
        out.push({ key, label: `Admission: ${fact.text}`, note: true });
        break;
      case "vendor-applications": {
        const state = fact.state === "open" ? "OPEN" : "CLOSED";
        if (ctx.mode !== "submission" && details?.vendorApplicationState !== state) {
          out.push({
            key,
            label: `Vendor applications: ${fact.state}`,
            apply: (v) => ({ details: { ...v.details, vendorApplicationState: state } }),
          });
        }
        break;
      }
      case "booth-fee":
        if (ctx.mode !== "submission" && details?.feeModelVendor?.trim() !== fact.text) {
          out.push({ key, label: `Booth fee: ${fact.text}`, apply: (v) => ({ details: { ...v.details, feeModelVendor: fact.text } }) });
        }
        break;
      case "application-deadline": {
        const date = fact.date ?? (ctx.dates ? deadlineDate(fact.text, ctx.dates) : null);
        if (ctx.mode !== "submission" && date && details?.vendorApplicationDeadline !== date) {
          out.push({ key, label: `Applications close: ${fact.text}`, apply: (v) => ({ details: { ...v.details, vendorApplicationDeadline: date } }) });
        }
        break;
      }
      case "importer-note":
        out.push({
          key,
          label: `Remove "${fact.sentence}"`,
          apply: (v) => ({ description: removeSentence(v.description, fact.sentence) }),
        });
        break;
      case "hours": {
        const dated = fact.days.filter((d) => d.date);
        if (dated.length > 0) {
          out.push({
            key,
            label: "Use these hours",
            apply: () => ({ days: dated.map((d) => makeDay(d.date!, d.startTime, d.endTime)) }),
          });
        }
        break;
      }
    }
  });
  return out;
}

/**
 * "Found in the text": what description-facts reads in the description, as chips that suggest and
 * never write on their own. Renders nothing when it finds nothing.
 */
export function FoundInText() {
  const { values, update, mode, options, context, readOnly } = useEditorForm();
  const facts = React.useMemo(() => findFacts(values.description), [values.description]);
  const days = values.days.map((d) => d.date).filter(Boolean).sort();
  const first = days[0] ?? context.stretch?.startDate;
  const last = days[days.length - 1] ?? context.stretch?.endDate;
  const suggestions = suggestionsFor(facts, {
    mode,
    features: options.features,
    current: values,
    dates: first && last ? { first, last } : null,
  });
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      <p className="pt-1 text-xs font-medium text-ash">Found in the text</p>
      <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
        {suggestions.map((s) => (
          <li key={s.key}>
            {s.note || !s.apply || readOnly ? (
              <span className="inline-flex min-h-[30px] items-center rounded-sm border border-dashed border-seam-strong px-2.5 text-sm text-basalt">
                {s.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const patch = s.apply?.(values);
                  if (patch) update(patch);
                }}
                className="inline-flex min-h-[30px] items-center rounded-sm border border-dashed border-seam-strong bg-sheet px-2.5 text-left text-sm text-basalt transition-colors duration-[80ms] hover:bg-hover"
              >
                {s.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
