"use client";

import * as React from "react";
import { Section } from "@/components/admin/kit/field";
import { useEditorForm } from "../form-context";
import { weekendOf, weekendSentence } from "../model";
import { ScheduleEditor } from "../schedule-editor";
import { SplitDailyHours } from "../split-daily-hours";

/** Schedule rows, or the one-stretch notice with "Split into daily hours", and the weekend it falls on. */
export function WhenSection() {
  const { values, update, context, readOnly, errors } = useEditorForm();
  const stretch = values.days.length === 0 ? context.stretch : null;
  const saturday = weekendOf(values.days, stretch, context.today);
  return (
    <Section id="when" title="When">
      {stretch ? (
        <SplitDailyHours stretch={stretch} description={values.description} readOnly={readOnly} onSplit={(days) => update({ days })} />
      ) : (
        <ScheduleEditor days={values.days} today={context.today} readOnly={readOnly} onChange={(days) => update({ days })} />
      )}
      {errors.days && (
        <p className="text-xs text-ponderosa">
          {errors.days}
        </p>
      )}
      {saturday && <p className="text-sm text-ash tabular-nums">{weekendSentence(saturday)}</p>}
    </Section>
  );
}
