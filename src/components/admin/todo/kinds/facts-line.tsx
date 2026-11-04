"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { About } from "../event-preview";
import type { HeldDay } from "../held-edits";
import type { TodoEvent } from "../types";
import { factChips, removeSentence, type FactDetails } from "./facts-model";

const CHIP =
  "inline-flex min-h-[30px] items-center gap-1.5 rounded-sm border px-2.5 text-left text-sm transition-colors duration-[80ms] pointer-coarse:min-h-11";

export type FactEdits = {
  description: string | null;
  setDescription: (value: string | null) => void;
  featureIds: string[] | null;
  setFeatureIds: (value: string[] | null) => void;
  details: FactDetails;
  setDetails: (value: FactDetails) => void;
  days: HeldDay[] | null;
  setDays: (value: HeldDay[] | null) => void;
};

/**
 * The About row of a decision pane: the description as it stands with held edits, and "Found in
 * the text", chips that propose what the description states (free admission, vendor
 * applications, booth fee, the hours it gives, sentences an import left behind). Pressing one
 * changes held values only; the decision saves them.
 */
export function AboutWithFacts({
  event,
  held,
  features,
}: {
  event: TodoEvent;
  held: FactEdits;
  features: { id: string; name: string }[];
}) {
  const chips = factChips(event, held, features);
  const edited = held.description !== null && held.description !== (event.description ?? "");
  return (
    <div>
      <About text={held.description ?? event.description} />
      {event.importerNote && !edited && <span className="mt-1 block text-xs text-ash">Reads like an importer note.</span>}
      {edited && (
        <button
          type="button"
          onClick={() => held.setDescription(null)}
          className="-ml-1 mt-1 inline-flex h-6 items-center rounded-sm px-1 text-xs font-medium text-lilac hover:bg-hover"
        >
          Keep the old description
        </button>
      )}
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-2">
          <p className="pt-1.5 text-xs font-medium text-ash">Found in the text</p>
          <ul role="list" className="flex min-w-0 flex-1 flex-wrap gap-2">
            {chips.map((chip) => (
              <li key={chip.key}>
                {chip.kind === "note" ? (
                  <span className={cn(CHIP, "border-dashed border-seam-strong text-basalt")}>{chip.label}</span>
                ) : (
                  <button
                    type="button"
                    aria-pressed={chip.kind === "details" ? chip.pressed : undefined}
                    onClick={() => {
                      switch (chip.kind) {
                        case "feature":
                          held.setFeatureIds([...(held.featureIds ?? event.features.map((f) => f.id)), chip.featureId]);
                          break;
                        case "details": {
                          const next = { ...held.details };
                          for (const [key, value] of Object.entries(chip.details) as [keyof FactDetails, string][]) {
                            if (chip.pressed) delete next[key];
                            else (next as Record<string, string>)[key] = value;
                          }
                          held.setDetails(next);
                          break;
                        }
                        case "remove":
                          held.setDescription(removeSentence(held.description ?? event.description ?? "", chip.sentence));
                          break;
                        case "hours":
                          held.setDays(chip.days);
                          break;
                      }
                    }}
                    className={cn(
                      CHIP,
                      chip.kind === "details" && chip.pressed
                        ? "border-seam-strong bg-lilac-tint text-basalt"
                        : "border-dashed border-seam-strong bg-sheet text-basalt hover:bg-hover"
                    )}
                  >
                    {chip.kind === "details" && chip.pressed && <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />}
                    {chip.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
