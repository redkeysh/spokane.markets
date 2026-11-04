"use client";

import * as React from "react";
import { Field, FieldRow } from "@/components/admin/kit/field";
import { CollapsibleSection } from "../collapsible-section";
import { EditorInput, EditorSelect, EditorTextarea } from "../controls";
import { useEditorForm } from "../form-context";
import { DETAIL_FIELDS, ONBOARDING_COLUMNS, type DetailField, type DetailKey, type DetailValues } from "../model";

const GROUPS = ["Visiting", "Vendors", "Permits and safety"] as const;

/** The filled count after held edits: the saved count, less the edited fields that were filled, plus those filled now. */
export function filledNow(savedCount: number, saved: DetailValues, current: DetailValues): number {
  let count = savedCount;
  for (const field of DETAIL_FIELDS) {
    const key = field.key as DetailKey;
    if (saved[key].trim()) count -= 1;
    if (current[key].trim()) count += 1;
  }
  return Math.max(0, Math.min(count, ONBOARDING_COLUMNS.length));
}

function DetailControl({ field, value, onChange, readOnly }: { field: DetailField; value: string; onChange: (v: string) => void; readOnly: boolean }) {
  switch (field.kind) {
    case "enum":
      return (
        <EditorSelect value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not set</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </EditorSelect>
      );
    case "yesno":
      return (
        <EditorSelect value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not set</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </EditorSelect>
      );
    case "date":
      return <EditorInput type="date" value={value} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} className="tabular-nums" />;
    case "int":
      return (
        <EditorInput
          value={value}
          readOnly={readOnly}
          inputMode="numeric"
          maxLength={9}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
          className="tabular-nums"
        />
      );
    case "long":
      return <EditorTextarea value={value} readOnly={readOnly} className="min-h-[60px]" onChange={(e) => onChange(e.target.value)} />;
    default:
      return <EditorInput value={value} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** The organizer details, grouped as Visiting, Vendors and Permits and safety. */
export function MoreDetailsSection() {
  const { values, saved, update, context, readOnly, errors } = useEditorForm();
  const filled = filledNow(context.detailsFilled, saved.details, values.details);
  const set = (key: DetailKey, value: string) => update({ details: { ...values.details, [key]: value } });
  return (
    <CollapsibleSection id="more-details" title="More details" summary={`${filled} of ${ONBOARDING_COLUMNS.length} filled`}>
      {GROUPS.map((group) => {
        const fields = (DETAIL_FIELDS as readonly DetailField[]).filter((f) => f.group === group);
        const short = fields.filter((f) => f.kind !== "long");
        const long = fields.filter((f) => f.kind === "long");
        return (
          <fieldset key={group} className="space-y-4">
            <legend className="text-sm font-semibold text-basalt">{group}</legend>
            {short.length > 0 && (
              <FieldRow>
                {short.map((field) => (
                  <Field key={field.key} id={`ed-detail-${field.key}`} label={field.label} error={errors[`details.${field.key as DetailKey}`]}>
                    <DetailControl field={field} value={values.details[field.key as DetailKey]} readOnly={readOnly} onChange={(v) => set(field.key as DetailKey, v)} />
                  </Field>
                ))}
              </FieldRow>
            )}
            {long.map((field) => (
              <Field key={field.key} id={`ed-detail-${field.key}`} label={field.label} error={errors[`details.${field.key as DetailKey}`]}>
                <DetailControl field={field} value={values.details[field.key as DetailKey]} readOnly={readOnly} onChange={(v) => set(field.key as DetailKey, v)} />
              </Field>
            ))}
          </fieldset>
        );
      })}
    </CollapsibleSection>
  );
}
