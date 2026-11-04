"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { EditorTextarea } from "./controls";
import { makeDay, type EditorDay, type EditorValues } from "./model";
import type { EditorOptions } from "./types";

type Json = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);
const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const triState = (v: unknown): boolean | null | undefined => (v === null ? null : bool(v));

function idsFrom(ids: unknown, slugs: unknown, known: readonly { id: string; slug: string }[]): string[] | undefined {
  if (Array.isArray(ids)) return ids.map(String).filter((id) => known.some((k) => k.id === id));
  if (Array.isArray(slugs)) return slugs.map((s) => known.find((k) => k.slug === String(s))?.id).filter((id): id is string => !!id);
  return undefined;
}

function daysFrom(data: Json): EditorDay[] | undefined {
  if (Array.isArray(data.scheduleDays) && data.scheduleDays.length > 0) {
    return (data.scheduleDays as Json[])
      .filter((d) => typeof d?.date === "string")
      .map((d) => makeDay(String(d.date).slice(0, 10), str(d.startTime) ?? "", str(d.endTime) ?? "", d.allDay === true));
  }
  const start = str(data.startDate);
  const end = str(data.endDate);
  if (start && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(start)) {
    const endTime = end && end.slice(0, 10) === start.slice(0, 10) ? end.slice(11, 16) : "";
    return [makeDay(start.slice(0, 10), start.slice(11, 16), endTime)];
  }
  return undefined;
}

/**
 * The editor values a pasted JSON object fills in (the shape the old import panel took: tagSlugs or
 * tagIds, scheduleDays or startDate and endDate, venueId or the venue address fields). Unknown keys
 * are ignored; a field the JSON leaves out keeps its current value.
 */
export function valuesFromJson(text: string, current: EditorValues, options: Pick<EditorOptions, "tags" | "features" | "places" | "markets">): { values: EditorValues; filled: number } {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Paste one JSON object, starting with {.");
  const data = parsed as Json;
  const next: EditorValues = { ...current, details: { ...current.details } };
  let filled = 0;
  const set = <K extends keyof EditorValues>(key: K, value: EditorValues[K] | undefined) => {
    if (value === undefined) return;
    next[key] = value;
    filled += 1;
  };
  set("title", str(data.title));
  set("slug", str(data.slug));
  set("description", str(data.description));
  set("days", daysFrom(data));
  const venueId = str(data.venueId);
  if (venueId && options.places.some((p) => p.id === venueId && !p.archived)) {
    set("venueId", venueId);
  } else if (str(data.venueName) && str(data.venueAddress)) {
    set("venueId", "");
    set("place", {
      name: str(data.venueName) ?? "",
      address: str(data.venueAddress) ?? "",
      city: str(data.venueCity) ?? "",
      state: str(data.venueState) ?? "",
      zip: str(data.venueZip) ?? "",
    });
  }
  const marketId = str(data.marketId);
  if (marketId !== undefined) set("marketId", options.markets.some((m) => m.id === marketId) ? marketId : "");
  set("imageUrl", str(data.imageUrl));
  set("showImageInList", bool(data.showImageInList));
  if (typeof data.imageFocalX === "number") set("imageFocalX", Math.max(0, Math.min(100, Math.round(data.imageFocalX))));
  if (typeof data.imageFocalY === "number") set("imageFocalY", Math.max(0, Math.min(100, Math.round(data.imageFocalY))));
  set("websiteUrl", str(data.websiteUrl));
  set("facebookUrl", str(data.facebookUrl));
  set("instagramUrl", str(data.instagramUrl));
  set("tagIds", idsFrom(data.tagIds, data.tagSlugs, options.tags));
  set("featureIds", idsFrom(data.featureIds, data.featureSlugs, options.features));
  const mode = str(data.participationMode);
  if (mode !== undefined && ["", "OPEN", "REQUEST_TO_JOIN", "INVITE_ONLY", "CAPACITY_LIMITED"].includes(mode)) set("participationMode", mode);
  if (typeof data.vendorCapacity === "number" || data.vendorCapacity === null) set("vendorCapacity", data.vendorCapacity === null ? "" : String(data.vendorCapacity));
  set("publicIntentListEnabled", triState(data.publicIntentListEnabled));
  set("publicIntentNamesEnabled", triState(data.publicIntentNamesEnabled));
  set("publicRosterEnabled", triState(data.publicRosterEnabled));
  const status = str(data.status);
  if (status === "DRAFT" || status === "PENDING") set("status", status);
  return { values: next, filled };
}

/** "Paste from JSON" on new events: fills the form, nothing is saved until Save. */
export function JsonPasteDialog({
  open,
  onOpenChange,
  current,
  options,
  onFill,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: EditorValues;
  options: EditorOptions;
  onFill: (values: EditorValues, filled: number) => void;
}) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const fill = () => {
    try {
      const { values, filled } = valuesFromJson(text, current, options);
      if (filled === 0) {
        setError("Nothing in it matches a field here. Use keys such as title, description, scheduleDays and tagSlugs.");
        return;
      }
      onFill(values, filled);
      setText("");
      setError(null);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof SyntaxError ? "That is not valid JSON." : err instanceof Error ? err.message : "That is not valid JSON.");
    }
  };
  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      size="list"
      title="Paste from JSON"
      description="Fills the form from a JSON object. Nothing is saved until you save."
      footer={
        <>
          <AdminButton variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </AdminButton>
          <AdminButton variant="ink" onClick={fill} disabled={!text.trim()}>
            Fill the form
          </AdminButton>
        </>
      }
    >
      <label htmlFor="ed-json" className="block text-sm font-medium text-basalt">
        JSON
      </label>
      <EditorTextarea
        id="ed-json"
        data-autofocus
        value={text}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "ed-json-error" : undefined}
        placeholder='{"title": "Holiday Bazaar", "scheduleDays": [...]}'
        className="mt-1.5 min-h-48 font-text text-xs"
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
      />
      {error && (
        <p id="ed-json-error" className="mt-1 text-xs text-ponderosa">
          {error}
        </p>
      )}
    </AdminDialog>
  );
}
