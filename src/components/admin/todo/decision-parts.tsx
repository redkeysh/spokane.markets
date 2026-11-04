"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { AdminButton, AdminLinkButton, type AdminButtonVariant } from "@/components/admin/kit/button";
import { LeavePrompt } from "@/components/admin/kit/save-bar";
import { isSingleCharacter } from "@/components/admin/kit/use-shortcuts";
import { editorHref } from "./decision-model";
import { PhoneDecisionBar } from "./phone-decision";
import { useTodo } from "./todo-context";
import type { Decision } from "./types";

/** One button of a decision's action row. */
export type ActionSpec = {
  label: string;
  /** Key hint, e.g. "P". */
  keys?: string;
  variant?: AdminButtonVariant;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
};

/**
 * The decision's title (Overpass 20/26), what sits on its right (position, status, date) and one
 * context line. The title takes focus when a phone opens the decision. With `editor`, the editor
 * shows in the title's place and the heading stays for screen readers.
 */
export function DecisionHeader({
  title,
  meta,
  context,
  editor,
  action,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  context?: React.ReactNode;
  editor?: React.ReactNode;
  /** One small control beside the title ("Change title"). */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h2
          id="todo-decision-title"
          tabIndex={-1}
          className={cn("min-w-0 max-w-[72ch] font-display text-xl/[26px] font-bold text-basalt focus:outline-none", editor && "sr-only")}
        >
          {title}
        </h2>
        {editor}
        {(meta || action) && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 pt-0.5 text-xs text-ash tabular-nums">
            {action}
            {meta}
          </div>
        )}
      </div>
      {context && <p className="mt-1 max-w-[72ch] text-sm text-ash">{context}</p>}
    </header>
  );
}

function DesktopButton({ spec }: { spec: ActionSpec }) {
  const { singleKeys } = useTodo();
  const variant = spec.variant ?? "outline";
  const keys = spec.keys && (singleKeys || !isSingleCharacter(spec.keys.toLowerCase())) ? spec.keys : undefined;
  if (spec.href) {
    return (
      <AdminLinkButton href={spec.href} variant={variant} keys={keys}>
        {spec.label}
      </AdminLinkButton>
    );
  }
  return (
    <AdminButton
      variant={variant}
      keys={keys}
      onClick={spec.onClick}
      disabled={spec.disabled}
      busy={spec.busy}
      busyLabel={spec.busyLabel}
    >
      {spec.label}
    </AdminButton>
  );
}

/** "Save changes first?" in place of the action row, when moving away would drop held edits. */
function LeaveQuestion() {
  const { pendingLeave, busy } = useTodo();
  if (!pendingLeave) return null;
  return (
    <LeavePrompt
      question="Save changes first?"
      onSave={pendingLeave.save}
      onDiscard={pendingLeave.discard}
      onStay={pendingLeave.cancel}
      saving={!!busy}
      className="sm-sticky-bottom mt-6 border-t-2 border-lilac bg-sheet py-3"
    />
  );
}

/**
 * The decision's actions with key hints, in the order given. On phones the same actions move to
 * the bottom bar: the filled one on the right, Reject on the left, the rest under More.
 */
export function DecisionActions({ actions, note }: { actions: ActionSpec[]; note?: React.ReactNode }) {
  const { pendingLeave } = useTodo();
  const primary = actions.find((a) => a.variant === "publish" || a.variant === "ink");
  const reject = actions.find((a) => a.variant === "danger-outline");
  const more = actions.filter((a) => a !== primary && a !== reject);
  return (
    <>
      {note && <div className="mt-6 max-w-[72ch] space-y-1 text-sm text-ash">{note}</div>}
      {pendingLeave ? (
        <LeaveQuestion />
      ) : (
        <div className="mt-6 hidden flex-wrap items-center gap-2 lg:flex">
          {actions.map((spec) => (
            <DesktopButton key={spec.label} spec={spec} />
          ))}
        </div>
      )}
      {!pendingLeave && <PhoneDecisionBar primary={primary} reject={reject} more={more} />}
    </>
  );
}

/** Edit (E) and Later (L), the two actions most decisions share. Split rows have no Later of their own. */
export function useStandardActions(decision: Decision): { edit: ActionSpec | null; later: ActionSpec | null } {
  const api = useTodo();
  const busy = api.busy !== null;
  return {
    edit: editorHref(decision) ? { label: "Edit", keys: "E", onClick: () => api.openEditor(decision), disabled: busy } : null,
    later: api.isSplit(decision.key)
      ? null
      : { label: "Later", keys: "L", onClick: () => void api.later(decision, "tomorrow"), disabled: busy },
  };
}
