"use client";

import * as React from "react";
import { findFacts, type DescriptionFact } from "@/lib/events/description-facts";
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

/** Turns what description-facts found into suggestions; each changes held values only when clicked. */
export function suggestionsFor(
  facts: DescriptionFact[],
  ctx: { mode: string; features: { id: string; name: string; slug: string }[] }
): Suggestion[] {
  const freeFeature = ctx.features.find((f) => f.slug === "free-admission" || /free admission/i.test(f.name));
  const out: Suggestion[] = [];
  facts.forEach((fact, i) => {
    const key = `${fact.kind}-${i}`;
    switch (fact.kind) {
      case "free-admission":
        if (freeFeature) {
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
      case "vendor-applications":
        if (ctx.mode !== "submission") {
          out.push({
            key,
            label: `Vendor applications: ${fact.state}`,
            apply: (v) => ({ details: { ...v.details, vendorApplicationState: fact.state === "open" ? "OPEN" : "CLOSED" } }),
          });
        }
        break;
      case "booth-fee":
        if (ctx.mode !== "submission") {
          out.push({ key, label: `Booth fee: ${fact.text}`, apply: (v) => ({ details: { ...v.details, feeModelVendor: fact.text } }) });
        }
        break;
      case "application-deadline":
        if (ctx.mode !== "submission" && fact.date) {
          const date = fact.date;
          out.push({ key, label: `Applications close: ${fact.text}`, apply: (v) => ({ details: { ...v.details, vendorApplicationDeadline: date } }) });
        }
        break;
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
  const { values, update, mode, options, readOnly } = useEditorForm();
  const facts = React.useMemo(() => findFacts(values.description), [values.description]);
  const suggestions = suggestionsFor(facts, { mode, features: options.features });
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
