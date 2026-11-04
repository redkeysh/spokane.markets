"use client";

import * as React from "react";
import { Field, FieldRow } from "@/components/admin/kit/field";
import { ThreeStateSelect } from "@/components/admin/kit/three-state-select";
import { CollapsibleSection } from "../collapsible-section";
import { EditorInput, EditorSelect } from "../controls";
import { useEditorForm } from "../form-context";
import { PARTICIPATION_OPTIONS, type EditorValues } from "../model";

/** "Same as the market", "Request to join, 40 spots". */
export function vendorSummary(values: Pick<EditorValues, "participationMode" | "vendorCapacity" | "publicIntentListEnabled" | "publicIntentNamesEnabled" | "publicRosterEnabled">, hasMarket: boolean): string {
  const mode = PARTICIPATION_OPTIONS.find((o) => o.value === values.participationMode);
  const overrides = [values.publicIntentListEnabled, values.publicIntentNamesEnabled, values.publicRosterEnabled].some((v) => v !== null);
  if (!values.participationMode && !values.vendorCapacity && !overrides) {
    return hasMarket ? "Same as the market" : "Site default: mark as attending";
  }
  const parts = [mode && mode.value ? mode.label : hasMarket ? "Joining as the market says" : "Mark as attending"];
  if (values.vendorCapacity) parts.push(`${values.vendorCapacity} ${values.vendorCapacity === "1" ? "spot" : "spots"}`);
  if (overrides) parts.push("own list settings");
  return parts.join(", ");
}

/** How vendors join and which vendor lists the public sees; each can follow the market. */
export function VendorsSection() {
  const { values, update, readOnly, errors } = useEditorForm();
  const hasMarket = !!values.marketId;
  const inherit = hasMarket ? "Use the market's setting" : "Use the site default (show)";
  return (
    <CollapsibleSection id="vendors" title="Vendors" summary={vendorSummary(values, hasMarket)}>
      <FieldRow>
        <Field id="ed-participation" label="How vendors join" error={errors.participationMode}>
          <EditorSelect value={values.participationMode} disabled={readOnly} onChange={(e) => update({ participationMode: e.target.value })}>
            {PARTICIPATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.value === "" && !hasMarket ? "Use the site default (mark as attending)" : o.label}
              </option>
            ))}
          </EditorSelect>
        </Field>
        <Field id="ed-capacity" label="Spots" help={hasMarket ? "Empty uses the market's number." : undefined} error={errors.vendorCapacity}>
          <EditorInput
            value={values.vendorCapacity}
            readOnly={readOnly}
            inputMode="numeric"
            maxLength={6}
            onChange={(e) => update({ vendorCapacity: e.target.value.replace(/\D/g, "") })}
            className="tabular-nums"
          />
        </Field>
      </FieldRow>
      <Field id="ed-intent-list" label="List of vendors who say they are coming">
        <ThreeStateSelect
          value={values.publicIntentListEnabled}
          disabled={readOnly}
          inheritLabel={inherit}
          onValueChange={(publicIntentListEnabled) => update({ publicIntentListEnabled })}
        />
      </Field>
      <Field id="ed-intent-names" label="Their names on that list">
        <ThreeStateSelect
          value={values.publicIntentNamesEnabled}
          disabled={readOnly}
          inheritLabel={inherit}
          onValueChange={(publicIntentNamesEnabled) => update({ publicIntentNamesEnabled })}
        />
      </Field>
      <Field id="ed-roster" label="Official vendor list">
        <ThreeStateSelect
          value={values.publicRosterEnabled}
          disabled={readOnly}
          inheritLabel={inherit}
          onValueChange={(publicRosterEnabled) => update({ publicRosterEnabled })}
        />
      </Field>
    </CollapsibleSection>
  );
}
