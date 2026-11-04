"use client";

import * as React from "react";
import { SaveBar, unsavedQuestion } from "@/components/admin/kit/save-bar";
import { useLeavePrompt } from "@/components/admin/shell/leave-guard";

/** A Site section with unsaved changes: the id of the element to scroll to, and its name. */
type UnsavedSection = { id: string; label: string };

const ReportContext = React.createContext<((section: UnsavedSection, dirty: boolean) => void) | null>(null);

/**
 * The Site page's one leave guard. Each section keeps its own Save and reports whether it holds
 * changes; while any does, leaving asks in a bar under the page that names them. Stay scrolls to
 * the first of them.
 */
export function SiteUnsaved({ children }: { children: React.ReactNode }) {
  const [sections, setSections] = React.useState<UnsavedSection[]>([]);
  const { leaving, stay: closePrompt, go } = useLeavePrompt(sections.length > 0, "/admin");

  const report = React.useCallback((section: UnsavedSection, dirty: boolean) => {
    setSections((list) => {
      const listed = list.some((s) => s.id === section.id);
      if (dirty === listed) return list;
      return dirty ? [...list, section] : list.filter((s) => s.id !== section.id);
    });
  }, []);

  const stay = () => {
    closePrompt();
    const first = sections[0] && document.getElementById(sections[0].id);
    first?.scrollIntoView({ block: "start" });
  };

  return (
    <ReportContext.Provider value={report}>
      {children}
      {leaving && sections.length > 0 && (
        <SaveBar
          state={null}
          leave={{
            question: unsavedQuestion(sections.map((s) => s.label)),
            onStay: stay,
            onDiscard: () => go(leaving),
          }}
        />
      )}
    </ReportContext.Provider>
  );
}

/** Tells the Site page whether this section holds unsaved changes. Does nothing outside it. */
export function useUnsavedSection(id: string, label: string, dirty: boolean) {
  const report = React.useContext(ReportContext);
  React.useEffect(() => {
    if (!report) return;
    report({ id, label }, dirty);
    return () => report({ id, label }, false);
  }, [report, id, label, dirty]);
}
