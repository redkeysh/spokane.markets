"use client";

import * as React from "react";
import { ChipToggles } from "@/components/admin/kit/chip-toggles";
import type { TodoPlaceOption } from "./types";

const SELECT =
  "h-9 w-full max-w-md rounded-md border border-seam-strong bg-sheet px-2 text-sm text-basalt pointer-coarse:h-11 pointer-coarse:text-base";

/** The title held in the decision header until the decision saves it. Takes focus when it opens. */
export function TitleInput({ value, onChange, problem }: { value: string; onChange: (value: string) => void; problem: string | null }) {
  const id = React.useId();
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="min-w-0 flex-1 basis-64">
      <label htmlFor={id} className="sr-only">
        Title
      </label>
      <input
        ref={ref}
        id={id}
        value={value}
        maxLength={200}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${id}-problem` : undefined}
        className="h-10 w-full rounded-md border border-seam-strong bg-sheet px-2 font-display text-xl/[26px] font-bold text-basalt pointer-coarse:h-11"
      />
      {problem && (
        <p id={`${id}-problem`} className="mt-1 text-xs text-ponderosa">
          {problem}
        </p>
      )}
    </div>
  );
}

/**
 * Every active place, held until the decision saves it. A place an event cannot be published at
 * says why under the list.
 */
export function PlacePicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: TodoPlaceOption[];
  onChange: (value: string) => void;
}) {
  const id = React.useId();
  const ref = React.useRef<HTMLSelectElement>(null);
  React.useEffect(() => {
    ref.current?.focus();
  }, []);
  const chosen = options.find((o) => o.id === value);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs text-ash">
        Move it to another saved place
      </label>
      <select
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={chosen?.problem ? `${id}-problem` : undefined}
        className={SELECT}
      >
        {!chosen && (
          <option value="" disabled>
            Choose a place
          </option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {chosen?.problem && (
        <p id={`${id}-problem`} className="text-xs font-medium text-honey-text">
          {chosen.problem}
        </p>
      )}
    </div>
  );
}

/** Tags or features held until the decision saves them, as toggle chips. */
export function NamesPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string[];
  options: { id: string; name: string }[];
  onChange: (value: string[]) => void;
}) {
  const choices = React.useMemo(() => options.map((o) => ({ value: o.id, label: o.name })), [options]);
  return <ChipToggles label={label} options={choices} value={value} onChange={onChange} />;
}
