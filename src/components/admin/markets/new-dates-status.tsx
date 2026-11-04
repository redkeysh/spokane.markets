"use client";

import * as React from "react";
import { SelectInput } from "./controls";

/** "New dates are [Draft]": Draft unless the owner chooses Published, with what each means. */
export function NewDatesStatus({
  value,
  onChange,
}: {
  value: "DRAFT" | "PUBLISHED";
  onChange: (value: "DRAFT" | "PUBLISHED") => void;
}) {
  const id = React.useId();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <label htmlFor={id} className="font-text text-sm text-ash">
        New dates are
      </label>
      <SelectInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value === "PUBLISHED" ? "PUBLISHED" : "DRAFT")}
        aria-describedby={`${id}-help`}
        className="w-auto"
      >
        <option value="DRAFT">Draft</option>
        <option value="PUBLISHED">Published</option>
      </SelectInput>
      <span id={`${id}-help`} className="text-xs text-ash">
        {value === "PUBLISHED" ? "On the site at once." : "Hidden until you publish them."}
      </span>
    </span>
  );
}
