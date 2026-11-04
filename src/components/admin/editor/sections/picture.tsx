"use client";

import * as React from "react";
import type { ComponentProps } from "react";
import { ImageUploadWithUrl } from "@/components/image-upload-with-url";
import { EventCard } from "@/components/event/event-card";
import { Field, Section } from "@/components/admin/kit/field";
import { PublicIsland } from "@/components/admin/kit/public-island";
import { useMediaQuery } from "@/components/admin/shell/use-media";
import { startOfPacificDay } from "@/lib/admin/format";
import { pictureIsWebPage } from "@/lib/events/readiness";
import { parseDateTimeInTimezone } from "@/lib/utils";
import { EditorInput, EditorSwitch } from "../controls";
import { FocalPoint } from "../focal-point";
import { useEditorForm } from "../form-context";
import type { EditorValues } from "../model";
import type { EditorOptions } from "../types";

type CardEvent = ComponentProps<typeof EventCard>["event"];

/** The public listing card for the values being edited, so the preview follows every held edit. */
function cardEvent(values: EditorValues, options: EditorOptions, slug: string): CardEvent {
  const days = [...values.days].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date));
  const first = days[0];
  const last = days[days.length - 1];
  const start = first ? parseDateTimeInTimezone(first.date, first.allDay ? "00:00" : first.startTime || "00:00", "America/Los_Angeles") : new Date();
  const end = last ? parseDateTimeInTimezone(last.date, last.allDay ? "23:59" : last.endTime || "23:59", "America/Los_Angeles") : start;
  const place = options.places.find((p) => p.id === values.venueId);
  return {
    id: "preview",
    title: values.title || "Untitled event",
    slug,
    imageUrl: values.imageUrl || null,
    showImageInList: values.showImageInList,
    imageFocalX: values.imageFocalX,
    imageFocalY: values.imageFocalY,
    startDate: start,
    endDate: end,
    venue: { name: place?.name ?? (values.place.name || "Place not chosen") },
    tags: options.tags.filter((t) => values.tagIds.includes(t.id)),
    features: options.features.filter((f) => values.featureIds.includes(f.id)),
    scheduleDays: days.map((d) => ({
      date: new Date(startOfPacificDay(d.date).getTime() + 12 * 3_600_000),
      startTime: d.allDay ? "00:00" : d.startTime,
      endTime: d.allDay ? "23:59" : d.endTime,
      allDay: d.allDay,
    })),
  } as unknown as CardEvent;
}

/** Upload or link, the web-page check, the focal point with card and banner crops, and the public card. */
export function PictureSection() {
  const { values, update, mode, options, readOnly, record, errors } = useEditorForm();
  const wide = useMediaQuery("(min-width: 1280px)", false);
  const isPage = pictureIsWebPage(values.imageUrl);
  const withFocal = mode !== "submission";
  return (
    <Section id="picture" title="Picture">
      <div className="max-w-[360px] [&_label]:sr-only">
        {readOnly ? null : (
          <ImageUploadWithUrl value={values.imageUrl} onChange={(url) => update({ imageUrl: url })} uploadType="event" label="Upload a picture" aspectRatio="banner" />
        )}
      </div>
      <Field
        id="ed-picture-link"
        label="Picture link"
        help={isPage ? undefined : "Upload above, or paste the link of a picture."}
        error={isPage ? "This link is a web page, not a picture. Upload the picture or paste the picture's own link." : errors.imageUrl}
      >
        <EditorInput value={values.imageUrl} readOnly={readOnly} inputMode="url" spellCheck={false} onChange={(e) => update({ imageUrl: e.target.value.trim() })} />
      </Field>
      {withFocal && values.imageUrl && !isPage && (
        <FocalPoint
          src={values.imageUrl}
          x={values.imageFocalX}
          y={values.imageFocalY}
          readOnly={readOnly}
          onChange={(imageFocalX, imageFocalY) => update({ imageFocalX, imageFocalY })}
        />
      )}
      {withFocal && (
        <EditorSwitch
          id="ed-show-picture"
          label="Show the picture on listing cards"
          checked={values.showImageInList}
          disabled={readOnly}
          onChange={(showImageInList) => update({ showImageInList })}
        />
      )}
      {withFocal && wide && (
        <figure className="space-y-2">
          <figcaption className="text-xs text-ash">How the listing card looks on the site</figcaption>
          <PublicIsland className="max-w-[400px] rounded-lg p-3">
            <div inert>
              <EventCard event={cardEvent(values, options, values.slug || record.slug || "preview")} />
            </div>
          </PublicIsland>
        </figure>
      )}
    </Section>
  );
}
