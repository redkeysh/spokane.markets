"use client";

import { SideSection } from "../editor-shell";
import { EditorTextarea } from "../controls";
import { useEditorForm } from "../form-context";

/** complianceNotes: always visible, never on the public site. Saved with the other held edits. */
export function Notes() {
  const { values, update, readOnly } = useEditorForm();
  return (
    <SideSection id="notes" title="Notes, only you see these">
      <label htmlFor="ed-notes" className="sr-only">
        Notes, only you see these
      </label>
      <EditorTextarea
        id="ed-notes"
        value={values.complianceNotes}
        readOnly={readOnly}
        maxLength={10000}
        placeholder="Anything to remember about this listing"
        className="min-h-20"
        onChange={(e) => update({ complianceNotes: e.target.value })}
      />
    </SideSection>
  );
}
