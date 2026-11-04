"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminStickyActionBar } from "@/components/admin/admin-form-layout";
import { AdminButton } from "@/components/admin/kit/button";
import { Field, FieldRow, Section } from "@/components/admin/kit/field";
import { List } from "@/components/admin/kit/list";
import { LeavePrompt, unsavedQuestion, type LeavePromptProps } from "@/components/admin/kit/save-bar";
import { Segmented } from "@/components/admin/kit/segmented";
import { Tooltip } from "@/components/admin/kit/tooltip";
import { CheckboxField, FormError, SelectInput, SwitchField, TextArea, TextInput } from "@/components/admin/rare/controls";
import { useLeavePrompt } from "@/components/admin/shell/leave-guard";
import { useAnnounce } from "@/components/admin/shell/live-region";
import type { FormField } from "./page";

type ApplicationFormType = "VENDOR" | "MARKET" | "VENDOR_VERIFICATION";

interface SerializedForm {
  id: string;
  type: ApplicationFormType;
  title: string;
  description: string | null;
  fields: FormField[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormsEditorClientProps {
  initialForms: SerializedForm[];
}

const FORM_WORDS: Record<ApplicationFormType, string> = {
  VENDOR: "Vendor application",
  MARKET: "Market application",
  VENDOR_VERIFICATION: "Vendor verification",
};

const FIELD_TYPE_WORDS: Record<FormField["type"], string> = {
  text: "Short text",
  textarea: "Long text",
  select: "Choice list",
  email: "Email",
  checkbox: "Checkbox",
};

const FIELD_TYPES = Object.keys(FIELD_TYPE_WORDS) as FormField["type"][];

function generateFieldId(): string {
  return `field_${Date.now()}`;
}

/** "Short text, required". */
export function questionMeta(field: Pick<FormField, "type" | "required" | "options">): string {
  const parts = [FIELD_TYPE_WORDS[field.type] ?? field.type];
  if (field.type === "select") {
    const count = field.options?.filter(Boolean).length ?? 0;
    parts.push(`${count} ${count === 1 ? "choice" : "choices"}`);
  }
  if (field.required) parts.push("required");
  return parts.join(", ");
}

function cleanChoices(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The choices as typed, blank lines included; the question keeps only the filled lines. */
function ChoicesField({ id, options, onChange }: { id: string; options: string[]; onChange: (options: string[]) => void }) {
  const joined = options.join("\n");
  const [text, setText] = React.useState(joined);
  const [seen, setSeen] = React.useState(joined);
  if (seen !== joined) {
    setSeen(joined);
    if (cleanChoices(text).join("\n") !== options.filter(Boolean).join("\n")) setText(joined);
  }
  return (
    <Field id={id} label="Choices" help="One per line.">
      <TextArea
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(cleanChoices(e.target.value));
        }}
      />
    </Field>
  );
}

function QuestionEditor({
  field,
  index,
  total,
  onUpdate,
  onMove,
  onRemove,
}: {
  field: FormField;
  index: number;
  total: number;
  onUpdate: (updates: Partial<FormField>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const base = `question-${field.id}`;
  return (
    <div className="space-y-4 border-t border-seam bg-sheet px-4 py-4">
      <FieldRow>
        <Field id={`${base}-label`} label="Question">
          <TextInput value={field.label} onChange={(e) => onUpdate({ label: e.target.value })} />
        </Field>
        <Field id={`${base}-type`} label="Answer">
          <SelectInput
            value={field.type}
            onChange={(e) =>
              onUpdate({
                type: e.target.value as FormField["type"],
                options: e.target.value === "select" ? (field.options?.length ? field.options : [""]) : undefined,
              })
            }
          >
            {FIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {FIELD_TYPE_WORDS[t]}
              </option>
            ))}
          </SelectInput>
        </Field>
      </FieldRow>
      <CheckboxField checked={field.required ?? false} onCheckedChange={(required) => onUpdate({ required })}>
        Required
      </CheckboxField>
      <FieldRow>
        <Field id={`${base}-placeholder`} label="Example answer" help="Shown in the empty field.">
          <TextInput value={field.placeholder ?? ""} onChange={(e) => onUpdate({ placeholder: e.target.value || undefined })} />
        </Field>
        <Field id={`${base}-help`} label="Help" help="Shown under the field.">
          <TextInput value={field.helpText ?? ""} onChange={(e) => onUpdate({ helpText: e.target.value || undefined })} />
        </Field>
      </FieldRow>
      {field.type === "select" && (
        <ChoicesField id={`${base}-options`} options={field.options ?? []} onChange={(options) => onUpdate({ options })} />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip content="Move up">
          <AdminButton variant="outline" size="icon-sm" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp strokeWidth={1.75} aria-hidden="true" />
          </AdminButton>
        </Tooltip>
        <Tooltip content="Move down">
          <AdminButton
            variant="outline"
            size="icon-sm"
            aria-label="Move down"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown strokeWidth={1.75} aria-hidden="true" />
          </AdminButton>
        </Tooltip>
        <AdminButton variant="danger-outline" size="sm" className="ml-auto" onClick={onRemove}>
          Remove question
        </AdminButton>
      </div>
    </div>
  );
}

function FormEditor({
  form,
  saved,
  onChange,
  onSaved,
  leavePrompt,
}: {
  form: SerializedForm;
  saved: SerializedForm;
  onChange: (form: SerializedForm) => void;
  onSaved: (form: SerializedForm) => void;
  /** Shown in place of Save while leaving the page waits on unsaved forms. */
  leavePrompt: LeavePromptProps | null;
}) {
  const announce = useAnnounce();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const name = FORM_WORDS[form.type];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/applications/forms", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          title: form.title,
          description: form.description ?? undefined,
          fields: form.fields,
          active: form.active,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Could not save. Try again.");
      }
      onSaved(form);
      const message = `Saved the ${name.toLowerCase()}.`;
      toast.success(message);
      announce(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  function setFields(fields: FormField[]) {
    onChange({ ...form, fields });
  }

  function addField() {
    const field: FormField = { id: generateFieldId(), label: "New question", type: "text", required: false };
    setFields([...form.fields, field]);
    setOpen(field.id);
    announce("Added a question at the end.");
  }

  const base = `form-${form.type.toLowerCase()}`;

  return (
    <form onSubmit={handleSave} noValidate>
      <div className="max-w-[784px] space-y-8">
        <Section id={`${base}-about`} title="About the form">
          <Field id={`${base}-title`} label="Title">
            <TextInput value={form.title} onChange={(e) => onChange({ ...form, title: e.target.value })} />
          </Field>
          <Field id={`${base}-description`} label="Description" help="Shown above the questions.">
            <TextArea rows={3} value={form.description ?? ""} onChange={(e) => onChange({ ...form, description: e.target.value || null })} />
          </Field>
          <SwitchField
            checked={form.active}
            onCheckedChange={(active) => onChange({ ...form, active })}
            label="Taking applications"
            help={form.active ? "People can send this form." : "The form is closed to new applications."}
          />
        </Section>

        <Section id={`${base}-questions`} title="Questions">
          {form.fields.length === 0 ? (
            <p className="font-text text-sm text-ash">No questions yet.</p>
          ) : (
            <List
              label={`Questions of the ${name.toLowerCase()}`}
              onTick={(key) => setOpen((current) => (current === key ? null : key))}
            >
              {form.fields.map((field, index) => {
                const expanded = open === field.id;
                const panelId = `${base}-${field.id}-panel`;
                return (
                  <li key={field.id} className="border-b border-seam bg-sheet">
                    <button
                      type="button"
                      data-roving-item
                      data-row-key={field.id}
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => setOpen(expanded ? null : field.id)}
                      className={cn(
                        "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left outline-offset-[-2px] hover:bg-hover",
                        expanded && "bg-lilac-tint hover:bg-lilac-tint"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-text text-sm font-medium break-words text-basalt">
                          {field.label || "Untitled question"}
                        </span>
                        <span className="mt-0.5 block font-text text-xs text-ash">{questionMeta(field)}</span>
                      </span>
                      <ChevronDown
                        className={cn("size-4 shrink-0 text-ash", expanded && "rotate-180")}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </button>
                    {expanded && (
                      <div id={panelId}>
                        <QuestionEditor
                          field={field}
                          index={index}
                          total={form.fields.length}
                          onUpdate={(updates) =>
                            setFields(form.fields.map((f, i) => (i === index ? { ...f, ...updates } : f)))
                          }
                          onMove={(direction) => {
                            const target = index + direction;
                            if (target < 0 || target >= form.fields.length) return;
                            const next = [...form.fields];
                            [next[index], next[target]] = [next[target], next[index]];
                            setFields(next);
                            announce(`Moved to place ${target + 1} of ${next.length}.`);
                          }}
                          onRemove={() => {
                            setFields(form.fields.filter((_, i) => i !== index));
                            setOpen(null);
                            announce(`Removed ${field.label || "the question"}. Save to keep the change.`);
                          }}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </List>
          )}
          <div>
            <AdminButton variant="outline" onClick={addField}>
              Add a question
            </AdminButton>
          </div>
        </Section>

        <FormError>{error}</FormError>
      </div>

      <AdminStickyActionBar className="flex flex-wrap items-center gap-3">
        {leavePrompt ? (
          <LeavePrompt {...leavePrompt} className="w-full" />
        ) : (
          <>
            <AdminButton type="submit" variant="ink" busy={saving} busyLabel="Saving" disabled={!dirty && !saving}>
              Save {name.toLowerCase()}
            </AdminButton>
            <p className="font-text text-sm text-ash" aria-live="polite">
              {dirty ? "Unsaved changes" : "No unsaved changes"}
            </p>
          </>
        )}
      </AdminStickyActionBar>
    </form>
  );
}

/** One application form at a time, chosen at the top; unsaved edits of each are kept while switching. */
export function FormsEditorClient({ initialForms }: FormsEditorClientProps) {
  const [forms, setForms] = React.useState<SerializedForm[]>(initialForms);
  const [saved, setSaved] = React.useState<SerializedForm[]>(initialForms);
  const [current, setCurrent] = React.useState<ApplicationFormType | undefined>(initialForms[0]?.type);
  const unsaved = forms.filter((f) => JSON.stringify(f) !== JSON.stringify(saved.find((s) => s.id === f.id) ?? f));
  const { leaving, stay, go } = useLeavePrompt(unsaved.length > 0, "/admin/more");

  const index = forms.findIndex((f) => f.type === current);
  if (index < 0) {
    return <p className="font-text text-[15px]/[23px] text-basalt">There are no application forms yet.</p>;
  }

  const replace = (list: SerializedForm[], form: SerializedForm) => list.map((f) => (f.id === form.id ? form : f));

  return (
    <div className="space-y-8">
      {forms.length > 1 && (
        <Segmented<ApplicationFormType>
          label="Form"
          value={forms[index].type}
          onChange={setCurrent}
          options={forms.map((f) => ({ value: f.type, label: FORM_WORDS[f.type] }))}
        />
      )}
      <FormEditor
        key={forms[index].id}
        form={forms[index]}
        saved={saved.find((s) => s.id === forms[index].id) ?? forms[index]}
        onChange={(form) => setForms((list) => replace(list, form))}
        onSaved={(form) => setSaved((list) => replace(list, form))}
        leavePrompt={
          leaving
            ? {
                question: unsavedQuestion(unsaved.map((f) => FORM_WORDS[f.type])),
                onStay: stay,
                onDiscard: () => go(leaving),
              }
            : null
        }
      />
    </div>
  );
}
