"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { keepCombined } from "@/app/admin/_actions/twins-series";
import { useRail } from "@/components/admin/shell/rail-context";
import { DecisionActions, type ActionSpec } from "../decision-parts";
import { keepMessage, weekLiveSentence } from "../messages";
import { weekKeyOf } from "../pile-model";
import { useDecisionKeys, useTodo } from "../todo-context";
import type { Decision, TodoEvent } from "../types";
import { combinedChanges, combineRows, defaultChoices, resultLine, type CombineChoice, type CombineChoices, type CombineField, type CombineRow } from "./combine-model";

function choiceKey(choice: CombineChoice | undefined): string {
  return choice === undefined ? "" : String(choice);
}

/** One field as radios: a label, then one option per copy (and "Both" for tags and features). */
function FieldChoice({
  row,
  value,
  onChange,
  copies,
}: {
  row: CombineRow;
  value: CombineChoice | undefined;
  onChange: (value: CombineChoice) => void;
  copies: number;
}) {
  const name = React.useId();
  return (
    <fieldset className="border-b border-seam py-2 sm:grid sm:grid-cols-[88px_minmax(0,1fr)] sm:gap-x-4">
      <legend className="sr-only">{row.label}</legend>
      <div aria-hidden="true" className="pb-1 text-sm font-medium text-ash sm:pb-0 sm:pt-0.5">
        {row.label}
      </div>
      <div>
        <div className={cn("grid gap-x-4 gap-y-1", copies === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3")}>
          {row.options
            .filter((o) => o.value !== "all")
            .map((option) => (
              <Option key={choiceKey(option.value)} name={name} option={option} checked={choiceKey(value) === choiceKey(option.value)} onChange={onChange} />
            ))}
        </div>
        {row.options
          .filter((o) => o.value === "all")
          .map((option) => (
            <div key="all" className="mt-1">
              <Option name={name} option={option} checked={value === "all"} onChange={onChange} />
            </div>
          ))}
        {row.note && <p className="mt-1 text-xs text-ash">{row.note}</p>}
      </div>
    </fieldset>
  );
}

function Option({
  name,
  option,
  checked,
  onChange,
}: {
  name: string;
  option: CombineRow["options"][number];
  checked: boolean;
  onChange: (value: CombineChoice) => void;
}) {
  const id = React.useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-6 items-start gap-2 rounded-sm px-1 py-0.5 text-sm",
        option.disabled ? "cursor-default text-ash" : "cursor-pointer text-basalt",
        checked && "bg-lilac-tint"
      )}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        disabled={!!option.disabled}
        onChange={() => onChange(option.value)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-basalt disabled:cursor-default"
      />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <span className="font-medium tabular-nums">{option.label}</span>
        <span className="sr-only">: </span>
        <span className="ml-2">{option.detail}</span>
        {option.disabled && <span className="block text-xs">{option.disabled}</span>}
      </span>
    </label>
  );
}

/**
 * "Pick field by field" for copies of one event: every field they disagree on as radios with a
 * default (the longer description that is not an importer note, the copy with more links, the
 * tags and features of both, the earlier start), the Result line, and keeping the combined copy
 * as a draft or publishing it. The other copies are archived as its duplicates. C goes back.
 */
export function CombineView({
  decision,
  events,
  keepId,
  onBack,
}: {
  decision: Decision;
  events: TodoEvent[];
  /** The copy that stays and takes the chosen values. */
  keepId: string;
  onBack: () => void;
}) {
  const api = useTodo();
  const { rail } = useRail();
  const keepIndex = Math.max(
    events.findIndex((e) => e.id === keepId),
    0
  );
  const keep = events[keepIndex];
  const rows = React.useMemo(() => combineRows(events, keepIndex), [events, keepIndex]);
  const [choices, setChoices] = React.useState<CombineChoices>(() => defaultChoices(events, keepIndex));
  const settles = new Set(decision.settles);
  const archiveIds = events.filter((e) => e.id !== keep.id && settles.has(e.id)).map((e) => e.id);
  const live = keep.status === "PUBLISHED";
  const busy = api.busy === decision.key;
  const anyBusy = api.busy !== null;
  const others = events.length - 1;
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const run = (publish: boolean) => {
    if (archiveIds.length === 0) return api.announce("Nothing here can be archived. Open the copies in the editor instead.");
    const changes = combinedChanges(events, keepIndex, choices);
    const week = rail.weeks.find((w) => w.key === weekKeyOf(decision.lane));
    void api.run(
      decision,
      () => keepCombined({ decisionKey: decision.key, keepId: keep.id, archiveIds, changes, publish: publish && !live }),
      (r) => {
        const text = keepMessage(changes.title ?? keep.title, publish && r.changed.length > 0, r.archived?.length ?? 0, r.notified);
        const sentence = r.changed.length ? weekLiveSentence(week, r.changed) : "";
        return { text, spoken: sentence ? `${text} ${sentence}` : text, live: r.changed };
      }
    );
  };

  useDecisionKeys({ p: () => run(true), c: onBack });

  const set = (field: CombineField) => (value: CombineChoice) => setChoices((prev) => ({ ...prev, [field]: value }));
  const actions: ActionSpec[] = live
    ? [{ label: "Keep combined", keys: "P", variant: "ink", onClick: () => run(false), disabled: anyBusy, busy, busyLabel: "Saving" }]
    : [
        { label: "Keep combined as draft", onClick: () => run(false), disabled: anyBusy },
        { label: "Keep combined and publish", keys: "P", variant: "publish", onClick: () => run(true), disabled: anyBusy, busy, busyLabel: "Publishing" },
      ];
  actions.push({ label: "Back to the comparison", keys: "C", variant: "quiet", onClick: onBack, disabled: anyBusy });

  return (
    <section aria-labelledby="combine-heading">
      <h3 id="combine-heading" ref={headingRef} tabIndex={-1} className="font-text text-[15px]/[20px] font-semibold text-basalt focus:outline-none">
        Pick field by field
      </h3>
      <p className="mt-1 max-w-[72ch] text-sm text-ash">
        Only the fields that differ are here. Copy {keepIndex + 1} stays and takes what you choose.
      </p>
      <div className="mt-3 border-t border-seam">
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-ash">The copies agree on every field.</p>
        ) : (
          rows.map((row) => <FieldChoice key={row.field} row={row} value={choices[row.field]} onChange={set(row.field)} copies={events.length} />)
        )}
      </div>
      <DecisionActions
        actions={actions}
        note={
          <div role="status" className="space-y-1">
            <p className="font-medium text-basalt tabular-nums">{resultLine(events, keepIndex, choices)}</p>
            <p>
              {others === 1 ? "The other is" : `The other ${others} are`} archived as {others === 1 ? "a duplicate" : "duplicates"} of it
              {live ? ". It stays live." : "."}
            </p>
          </div>
        }
      />
    </section>
  );
}
