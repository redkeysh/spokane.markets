"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { AdminButton } from "@/components/admin/kit/button";
import { LeavePrompt } from "@/components/admin/kit/save-bar";
import { useLeavePrompt } from "@/components/admin/shell/leave-guard";
import { assignReport, saveReportTriage } from "@/app/admin/_actions/inbox";
import { ESCALATION_WORDS, SEVERITY_WORDS } from "@/lib/admin/inbox/words";
import type { InboxReport } from "@/lib/admin/inbox/types";
import { useInboxAction } from "./use-inbox-action";

const SELECT =
  "h-[30px] rounded-md border border-seam-strong bg-sheet px-2 font-text text-sm text-basalt pointer-coarse:h-11 pointer-coarse:text-base";

export type NotesDirty = { count: number; save: () => Promise<boolean> } | null;

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Escalation = "NEW" | "TRIAGED" | "ESCALATED" | "CLOSED";
type Draft = { severity: string; escalation: string; notes: string };

const draftOf = (report: InboxReport): Draft => ({
  severity: report.severity,
  escalation: report.escalationStatus,
  notes: report.internalNotes ?? "",
});

/** The fields of the draft that differ from the saved report, as saveReportTriage takes them. */
function changesOf(draft: Draft, report: InboxReport) {
  return {
    ...(draft.severity !== report.severity ? { severity: draft.severity as Severity } : {}),
    ...(draft.escalation !== report.escalationStatus ? { escalationStatus: draft.escalation as Escalation } : {}),
    ...(draft.notes.trim() !== (report.internalNotes ?? "") ? { internalNotes: draft.notes } : {}),
  };
}

/**
 * Severity, escalation, who it is assigned to and internal notes, folded under "Triage details".
 * Open by default only when the report is high or critical, escalated, assigned or has notes.
 * Severity, escalation and notes are held until "Save triage details"; assigning saves at once.
 * Unsaved changes hold leaving the page; with `onDirty` the frame around it asks instead.
 * `onSaved` runs after every save.
 */
export function ReportTriage({
  report,
  defaultOpen,
  onDirty,
  onSaved,
}: {
  report: InboxReport;
  defaultOpen?: boolean;
  onDirty?: (dirty: NotesDirty) => void;
  onSaved?: () => void;
}) {
  const id = React.useId();
  const { run, busy } = useInboxAction({ onDone: () => onSaved?.() });
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(report));
  const [seen, setSeen] = React.useState(report);
  if (seen !== report) {
    setSeen(report);
    const before = draftOf(seen);
    const after = draftOf(report);
    setDraft((prev) => ({
      severity: before.severity !== after.severity || prev.severity === before.severity ? after.severity : prev.severity,
      escalation: before.escalation !== after.escalation || prev.escalation === before.escalation ? after.escalation : prev.escalation,
      notes: before.notes !== after.notes || prev.notes.trim() === before.notes ? after.notes : prev.notes,
    }));
  }
  const open =
    defaultOpen ??
    (report.severity === "HIGH" || report.severity === "CRITICAL" || report.escalationStatus === "ESCALATED" || !!report.internalNotes || !!report.assignee);

  const changed = Object.keys(changesOf(draft, report)).length;
  const save = React.useCallback(async () => {
    const changes = changesOf(draft, report);
    if (Object.keys(changes).length === 0) return false;
    return !!(await run("triage", () => saveReportTriage({ reportId: report.id, ...changes })));
  }, [draft, report, run]);
  const { leaving, stay, go } = useLeavePrompt(changed > 0 && !onDirty);
  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  });
  React.useEffect(() => {
    onDirty?.(changed > 0 ? { count: changed, save: () => saveRef.current() } : null);
  }, [changed, onDirty]);
  React.useEffect(() => () => onDirty?.(null), [onDirty]);

  const set = (field: keyof Draft) => (e: React.ChangeEvent<HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <details open={open} className="group">
      <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-medium text-lilac [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 transition-transform duration-[80ms] group-open:rotate-90 motion-reduce:transition-none" strokeWidth={1.75} />
        Triage details
      </summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <label htmlFor={`${id}-severity`} className="text-sm text-ash">
              Severity
            </label>
            <select id={`${id}-severity`} className={SELECT} value={draft.severity} onChange={set("severity")}>
              {Object.entries(SEVERITY_WORDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </span>
          <span className="inline-flex items-center gap-2">
            <label htmlFor={`${id}-escalation`} className="text-sm text-ash">
              Escalation
            </label>
            <select id={`${id}-escalation`} className={SELECT} value={draft.escalation} onChange={set("escalation")}>
              {Object.entries(ESCALATION_WORDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-basalt">
          <span>{report.assignee ? `Assigned to ${report.assignee.name}` : "Not assigned"}</span>
          <AdminButton
            variant="quiet"
            size="sm"
            busy={busy === "assign"}
            busyLabel="Saving"
            disabled={busy !== null}
            onClick={() => void run("assign", () => assignReport({ reportId: report.id, assign: !report.assignee }))}
          >
            {report.assignee ? "Unassign" : "Assign to me"}
          </AdminButton>
        </p>
        <div>
          <label htmlFor={`${id}-notes`} className="block text-sm font-medium text-basalt">
            Internal notes
          </label>
          <p id={`${id}-notes-help`} className="mt-0.5 text-xs text-ash">
            Only admins see these.
          </p>
          <textarea
            id={`${id}-notes`}
            aria-describedby={`${id}-notes-help`}
            rows={2}
            value={draft.notes}
            onChange={set("notes")}
            className="mt-1.5 w-full max-w-[72ch] rounded-md border border-seam-strong bg-sheet p-2 font-text text-sm text-basalt pointer-coarse:text-base"
          />
          {leaving ? (
            <LeavePrompt
              className="mt-2"
              question="Save the triage details before leaving?"
              onStay={stay}
              onDiscard={() => go(leaving)}
              onSave={() => void save().then((ok) => ok && go(leaving))}
              saving={busy === "triage"}
            />
          ) : (
            changed > 0 && (
              <AdminButton
                size="sm"
                className="mt-2"
                busy={busy === "triage"}
                busyLabel="Saving"
                disabled={busy !== null}
                onClick={() => void save()}
              >
                Save triage details
              </AdminButton>
            )
          )}
        </div>
      </div>
    </details>
  );
}
