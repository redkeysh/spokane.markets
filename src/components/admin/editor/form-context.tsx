"use client";

import * as React from "react";
import type { EditorErrors, EditorMode, EditorValues } from "./model";
import type { EditorContextData, EditorOptions, EditorRecord } from "./types";

export type EditorForm = {
  mode: EditorMode;
  record: EditorRecord;
  values: EditorValues;
  /** The values as last saved. */
  saved: EditorValues;
  /** Held edits: nothing is saved until Save, Publish or a decision. */
  update: (patch: Partial<EditorValues>) => void;
  options: EditorOptions;
  context: EditorContextData;
  /** Field errors from the last save, by field name. */
  errors: EditorErrors;
  /** Archived records and decided submissions are read only. */
  readOnly: boolean;
};

const EditorFormContext = React.createContext<EditorForm | null>(null);

export const EditorFormProvider = EditorFormContext.Provider;

export function useEditorForm(): EditorForm {
  const value = React.useContext(EditorFormContext);
  if (!value) throw new Error("useEditorForm must be used inside the event editor");
  return value;
}
