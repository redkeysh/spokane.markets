"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { KeyHint } from "@/components/admin/kit/key-hint";
import type { NeighborhoodRow } from "@/lib/venues/neighborhood-suggest";
import {
  fieldValue,
  keepRecordChoices,
  mergePlan,
  type MergeChoices,
  type PlaceRecord,
} from "@/lib/venues/place-review";
import { usesText } from "@/lib/venues/words";
import { RowSelect } from "./controls";

type ChoiceField = "name" | "address" | "town";

const FIELD_LABEL: Record<ChoiceField | "neighborhood" | "uses", string> = {
  name: "Name",
  address: "Address",
  town: "Town, ZIP",
  neighborhood: "Neighborhood",
  uses: "Uses",
};

function neighborhoodLabel(
  slug: string | null,
  neighborhoods: readonly NeighborhoodRow[],
): string {
  if (!slug) return "none";
  return neighborhoods.find((n) => n.slug === slug)?.label ?? slug;
}

function differs(records: readonly PlaceRecord[], field: ChoiceField): boolean {
  return new Set(records.map((r) => fieldValue(r, field))).size > 1;
}

function Radio({
  name,
  checked,
  onChange,
  label,
  children,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-6 cursor-pointer items-start gap-2">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-basalt"
      />
      <span
        className={cn(
          "min-w-0 break-words",
          checked ? "text-basalt" : "text-ash",
        )}
      >
        {children}
      </span>
    </label>
  );
}

/**
 * The field-by-field merge table: one column per record, one row per field. Radios pick the value
 * to keep per field, so the cleanest name and the cleanest address can come from different
 * records; choosing a record to keep takes its name, address and town too. The Keep column is
 * the record the merge will keep. Below 768 px each field is a group of choices instead.
 */
export function MergeTable({
  groupId,
  records,
  choices,
  onChange,
  neighborhoods,
}: {
  groupId: string;
  records: PlaceRecord[];
  choices: MergeChoices;
  onChange: (choices: MergeChoices) => void;
  neighborhoods: readonly NeighborhoodRow[];
}) {
  const set = (patch: Partial<MergeChoices>) =>
    onChange({ ...choices, ...patch });
  const keep = (id: string) => onChange(keepRecordChoices(choices, id));
  const keptId = mergePlan(records, choices).keepId;
  const slugs = [...new Set(records.map((r) => r.neighborhood))];
  const neighborhoodDiffers = slugs.length > 1;
  const noNeighborhood = slugs.length === 1 && slugs[0] === null;
  const active = neighborhoods.filter((n) => n.isActive);

  const setOne = (id: string) => (
    <RowSelect
      id={id}
      value={choices.neighborhood ?? ""}
      onChange={(e) => set({ neighborhood: e.target.value || null })}
      aria-label="Neighborhood for the place you keep"
    >
      <option value="">No neighborhood</option>
      {active.map((n) => (
        <option key={n.slug} value={n.slug}>
          {n.label}
        </option>
      ))}
    </RowSelect>
  );

  return (
    <div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed border-collapse font-text text-sm">
          <caption className="sr-only">
            Choose the value to keep for each field
          </caption>
          <colgroup>
            <col className="w-[120px]" />
            {records.map((r) => (
              <col key={r.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-seam">
              <th
                scope="col"
                className="py-2 pr-3 text-left text-xs font-semibold text-ash"
              >
                <span className="sr-only">Field</span>
              </th>
              {records.map((r, i) => (
                <th
                  key={r.id}
                  scope="col"
                  className="py-2 pr-3 text-left align-bottom font-normal"
                >
                  <label className="inline-flex min-h-6 cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name={`${groupId}-keep`}
                      checked={keptId === r.id}
                      onChange={() => keep(r.id)}
                      aria-label={`Keep record ${i + 1}, ${r.name}`}
                      className="size-4 cursor-pointer accent-basalt"
                    />
                    <span
                      className={cn(
                        "text-sm font-medium",
                        keptId === r.id ? "text-basalt" : "text-ash",
                      )}
                    >
                      {keptId === r.id ? "Keep" : "Merge in"}
                    </span>
                    {records.length <= 9 && <KeyHint keys={String(i + 1)} />}
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["name", "address", "town"] as const).map((field) => {
              const many = differs(records, field);
              return (
                <tr
                  key={field}
                  className={cn(
                    "border-b border-seam align-top",
                    many && "bg-honey-tint",
                  )}
                >
                  <th
                    scope="row"
                    className="py-2 pr-3 text-left text-sm font-medium text-basalt"
                  >
                    {FIELD_LABEL[field]}
                    {many && (
                      <span className="block text-xs font-normal text-honey-text">
                        differs
                      </span>
                    )}
                  </th>
                  {records.map((r, i) => (
                    <td key={r.id} className="py-2 pr-3">
                      {many ? (
                        <Radio
                          name={`${groupId}-${field}`}
                          checked={choices[field] === r.id}
                          onChange={() => set({ [field]: r.id })}
                          label={`${FIELD_LABEL[field]} from record ${i + 1}: ${fieldValue(r, field)}`}
                        >
                          {fieldValue(r, field)}
                        </Radio>
                      ) : (
                        <span className="text-basalt">
                          {fieldValue(r, field)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr
              className={cn(
                "border-b border-seam align-top",
                neighborhoodDiffers && "bg-honey-tint",
              )}
            >
              <th
                scope="row"
                className="py-2 pr-3 text-left text-sm font-medium text-basalt"
              >
                {FIELD_LABEL.neighborhood}
                {neighborhoodDiffers && (
                  <span className="block text-xs font-normal text-honey-text">
                    differs
                  </span>
                )}
              </th>
              {noNeighborhood ? (
                <td colSpan={records.length} className="py-2 pr-3">
                  <span className="mr-3 text-ash">None has one.</span>
                  {setOne(`${groupId}-set-one`)}
                </td>
              ) : (
                records.map((r, i) => (
                  <td key={r.id} className="py-2 pr-3">
                    {neighborhoodDiffers ? (
                      <Radio
                        name={`${groupId}-neighborhood`}
                        checked={choices.neighborhood === r.neighborhood}
                        onChange={() => set({ neighborhood: r.neighborhood })}
                        label={`Neighborhood from record ${i + 1}: ${neighborhoodLabel(r.neighborhood, neighborhoods)}`}
                      >
                        {neighborhoodLabel(r.neighborhood, neighborhoods)}
                      </Radio>
                    ) : (
                      <span className="text-basalt">
                        {neighborhoodLabel(r.neighborhood, neighborhoods)}
                      </span>
                    )}
                  </td>
                ))
              )}
            </tr>
            <tr className="align-top">
              <th
                scope="row"
                className="py-2 pr-3 text-left text-sm font-medium text-basalt"
              >
                {FIELD_LABEL.uses}
              </th>
              {records.map((r) => (
                <td key={r.id} className="py-2 pr-3 text-ash tabular-nums">
                  {usesText(r.uses)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="space-y-4 md:hidden">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-basalt">
            Record to keep
          </legend>
          <div className="space-y-2">
            {records.map((r, i) => (
              <Radio
                key={r.id}
                name={`${groupId}-keep-phone`}
                checked={keptId === r.id}
                onChange={() => keep(r.id)}
                label={`Keep record ${i + 1}, ${r.name}, ${usesText(r.uses)}`}
              >
                {i + 1}. {r.name}, {usesText(r.uses)}
              </Radio>
            ))}
          </div>
        </fieldset>
        {(["name", "address", "town"] as const).map((field) =>
          differs(records, field) ? (
            <fieldset key={field} className="rounded-sm bg-honey-tint p-2">
              <legend className="mb-2 text-sm font-medium text-basalt">
                Keep this {FIELD_LABEL[field].toLowerCase()}{" "}
                <span className="text-xs font-normal text-honey-text">
                  (differs)
                </span>
              </legend>
              <div className="space-y-2">
                {records.map((r, i) => (
                  <Radio
                    key={r.id}
                    name={`${groupId}-${field}-phone`}
                    checked={choices[field] === r.id}
                    onChange={() => set({ [field]: r.id })}
                    label={`${FIELD_LABEL[field]} from record ${i + 1}: ${fieldValue(r, field)}`}
                  >
                    {fieldValue(r, field)}
                  </Radio>
                ))}
              </div>
            </fieldset>
          ) : (
            <p key={field} className="text-sm">
              <span className="font-medium text-basalt">
                {FIELD_LABEL[field]}:{" "}
              </span>
              <span className="text-basalt">
                {fieldValue(records[0], field)}
              </span>
            </p>
          ),
        )}
        {noNeighborhood ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label
              htmlFor={`${groupId}-set-one-phone`}
              className="font-medium text-basalt"
            >
              Neighborhood
            </label>
            {setOne(`${groupId}-set-one-phone`)}
          </div>
        ) : neighborhoodDiffers ? (
          <fieldset className="rounded-sm bg-honey-tint p-2">
            <legend className="mb-2 text-sm font-medium text-basalt">
              Keep this neighborhood
            </legend>
            <div className="space-y-2">
              {slugs.map((slug) => (
                <Radio
                  key={slug ?? "none"}
                  name={`${groupId}-neighborhood-phone`}
                  checked={choices.neighborhood === slug}
                  onChange={() => set({ neighborhood: slug })}
                  label={`Neighborhood ${neighborhoodLabel(slug, neighborhoods)}`}
                >
                  {neighborhoodLabel(slug, neighborhoods)}
                </Radio>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-sm">
            <span className="font-medium text-basalt">Neighborhood: </span>
            <span className="text-basalt">
              {neighborhoodLabel(slugs[0] ?? null, neighborhoods)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
