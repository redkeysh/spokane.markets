"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/kit/button";
import { AdminDialog } from "@/components/admin/kit/dialog";
import { KeyHint } from "@/components/admin/kit/key-hint";
import { isSingleCharacter } from "@/components/admin/kit/use-shortcuts";
import { useShell } from "./shell-context";

/** Alternatives of sequences: [["/"], ["Ctrl+K"]] reads "/ or Ctrl+K"; [["g", "t"]] reads "g then t". */
type Keys = string[][];
type Row = { keys: Keys; what: string };

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: "Everywhere",
    rows: [
      { keys: [["/"], ["Ctrl+K"]], what: "Jump to a page or command" },
      { keys: [["?"]], what: "This list" },
      { keys: [["g", "t"]], what: "To do" },
      { keys: [["g", "e"]], what: "Events" },
      { keys: [["g", "m"]], what: "Markets" },
      { keys: [["g", "v"]], what: "Venues" },
      { keys: [["g", "s"]], what: "Site" },
      { keys: [["n"]], what: "New event" },
    ],
  },
  {
    title: "To do",
    rows: [
      { keys: [["j"], ["Down"]], what: "Next decision" },
      { keys: [["k"], ["Up"]], what: "Previous decision" },
      { keys: [["["], ["]"]], what: "Previous or next weekend; the same key again shows every weekend" },
      { keys: [["Home"]], what: "Top of the pile" },
    ],
  },
  {
    title: "Any decision",
    rows: [
      { keys: [["p"]], what: "Put it on the site" },
      { keys: [["x"]], what: "Keep it off the site, then 1 to 5 for the reason and Enter" },
      { keys: [["e"]], what: "Open the full editor" },
      { keys: [["l"]], what: "Later, until tomorrow" },
      { keys: [["Shift+L"]], what: "Later, until next Monday" },
      { keys: [["u"], ["Ctrl+Z"]], what: "Undo the last decision" },
    ],
  },
  {
    title: "Groups of rows",
    rows: [
      { keys: [["Tab"]], what: "Into the rows" },
      { keys: [["Space"]], what: "Tick or untick" },
      { keys: [["a"]], what: "Tick all" },
      { keys: [["Shift+A"]], what: "Tick none" },
    ],
  },
  {
    title: "Same event twice?",
    rows: [
      { keys: [["1"], ["2"]], what: "Keep that one and publish" },
      { keys: [["Shift+1"], ["Shift+2"]], what: "Keep that one without publishing" },
      { keys: [["c"]], what: "Pick field by field" },
      { keys: [["d"]], what: "Different events" },
    ],
  },
  {
    title: "Duplicate places",
    rows: [
      { keys: [["1"], ["2"], ["3"]], what: "Choose the record to keep" },
      { keys: [["m"]], what: "Merge" },
      { keys: [["d"]], what: "Different places" },
    ],
  },
  {
    title: "Lists",
    rows: [
      { keys: [["j"], ["k"]], what: "Move" },
      { keys: [["Space"]], what: "Tick" },
      { keys: [["Shift+J"], ["Shift+K"]], what: "Tick while moving" },
      { keys: [["Enter"]], what: "Open" },
      { keys: [["p"]], what: "Publish the ticked rows" },
      { keys: [["x"]], what: "Reject the ticked rows" },
      { keys: [["f"]], what: "Search" },
      { keys: [["Esc"]], what: "Clear the ticks" },
    ],
  },
  {
    title: "Editor",
    rows: [
      { keys: [["Ctrl+S"]], what: "Save" },
      { keys: [["Ctrl+Enter"]], what: "Save and publish" },
      { keys: [["Esc"]], what: "Back to where you came from" },
      { keys: [["Alt+Down"], ["Alt+Up"]], what: "Save and open the next or previous waiting event" },
    ],
  },
];

/** Whether turning off single-key shortcuts turns off every alternative of the row. */
function turnsOff(keys: Keys): boolean {
  return keys.every((sequence) =>
    isSingleCharacter(sequence.map((k) => k.toLowerCase().replace("ctrl", "mod")).join(" "))
  );
}

function KeyCombo({ keys, off }: { keys: Keys; off: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1 text-xs text-ash">
      {keys.map((sequence, i) => (
        <Fragment key={i}>
          {i > 0 && <span>or</span>}
          {sequence.map((k, j) => (
            <Fragment key={k}>
              {j > 0 && <span>then</span>}
              <KeyHint keys={k} className={off ? "text-ash" : "text-basalt"} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

function spoken(keys: Keys): string {
  return keys.map((sequence) => sequence.join(" then ")).join(" or ");
}

/** The ? sheet: every shortcut, and the switch for single-key shortcuts. */
export function ShortcutSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { singleKeys, setSingleKeys } = useShell();

  return (
    <AdminDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description={
        singleKeys
          ? "Single keys never act while you type in a field."
          : "Single-key shortcuts are off, so only Ctrl combinations and the arrow keys work."
      }
      size="list"
      footer={
        <>
          <AdminButton
            variant="outline"
            onClick={() => setSingleKeys(!singleKeys)}
          >
            {singleKeys ? "Turn off single-key shortcuts" : "Turn on single-key shortcuts"}
          </AdminButton>
          <AdminButton variant="ink" onClick={() => onOpenChange(false)}>
            Close
          </AdminButton>
        </>
      }
    >
      <div className="space-y-6 pb-2">
        {SECTIONS.map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h3 className="font-text text-[15px]/[20px] font-semibold text-basalt">{section.title}</h3>
            <dl className="mt-2 grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-4 gap-y-2">
              {section.rows.map((row) => {
                const off = !singleKeys && turnsOff(row.keys);
                return (
                  <Fragment key={row.what}>
                    <dt>
                      <span className="sr-only">{spoken(row.keys)}</span>
                      <span aria-hidden="true">
                        <KeyCombo keys={row.keys} off={off} />
                      </span>
                    </dt>
                    <dd className={cn("text-sm text-basalt", off && "text-ash")}>
                      {row.what}
                      {off && <span className="text-ash">, off</span>}
                    </dd>
                  </Fragment>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
    </AdminDialog>
  );
}
