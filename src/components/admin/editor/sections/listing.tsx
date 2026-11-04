"use client";

import * as React from "react";
import { AdminButton } from "@/components/admin/kit/button";
import { Field, Section } from "@/components/admin/kit/field";
import { slugDisagreesWithTitle } from "@/lib/events/readiness";
import { EVENT_SLUG_MAX_LENGTH, EVENT_SLUG_PATTERN } from "@/lib/events/slug-rules";
import { checkWebAddressAction } from "@/app/admin/_actions/editor";
import { EditorInput, EditorTextarea } from "../controls";
import { FoundInText } from "../found-in-text";
import { useEditorForm } from "../form-context";
import { autoSlug } from "../model";

function slugPatternProblem(slug: string): string | null {
  if (!slug) return null;
  if (!EVENT_SLUG_PATTERN.test(slug) || slug.length > EVENT_SLUG_MAX_LENGTH) {
    return `Use lowercase letters, numbers and single hyphens, up to ${EVENT_SLUG_MAX_LENGTH} characters.`;
  }
  return null;
}

function WebAddress() {
  const { values, update, record, mode, errors, readOnly } = useEditorForm();
  const [serverProblem, setServerProblem] = React.useState<{ slug: string; problem: string } | null>(null);
  const firstDate = [...values.days].map((d) => d.date).filter(Boolean).sort()[0];
  const suggested = autoSlug(values.title || "event", firstDate);
  const isNew = mode === "new";
  const patternProblem = slugPatternProblem(values.slug);
  const problem =
    patternProblem ?? (serverProblem && serverProblem.slug === values.slug ? serverProblem.problem : null) ?? errors.slug ?? null;
  const live = record.status === "PUBLISHED";
  const helpId = "ed-slug-help";
  const errorId = "ed-slug-error";

  const check = async () => {
    const slug = values.slug.trim();
    if (!slug || slugPatternProblem(slug) || slug === record.slug) return;
    const result = await checkWebAddressAction(record.id, slug);
    setServerProblem(result ? { slug, problem: result } : null);
  };

  return (
    <div>
      <label htmlFor="ed-slug" className="block text-sm font-medium text-basalt">
        Web address
      </label>
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center">
          <span aria-hidden="true" className="hidden shrink-0 pr-1 text-sm text-ash sm:inline">
            spokane.markets/events/
          </span>
          <EditorInput
            id="ed-slug"
            value={values.slug}
            placeholder={isNew ? suggested : undefined}
            readOnly={readOnly}
            spellCheck={false}
            autoCapitalize="off"
            aria-describedby={problem ? `${helpId} ${errorId}` : helpId}
            aria-invalid={problem ? true : undefined}
            onChange={(e) => update({ slug: e.target.value.trim().toLowerCase() })}
            onBlur={() => void check()}
          />
        </div>
        {!readOnly && (
          <AdminButton
            variant="outline"
            onClick={() => {
              update({ slug: isNew ? "" : suggested });
              setServerProblem(null);
            }}
            aria-label={isNew ? "Make the web address from the title" : `Make the web address from the title: ${suggested}`}
          >
            Auto
          </AdminButton>
        )}
      </div>
      <p id={helpId} className="mt-1 text-xs text-ash">
        {isNew
          ? values.slug
            ? "Changing this changes the public link."
            : "Made from the title and the first date when you save."
          : live
            ? "Changing this changes the public link. The old link keeps working."
            : "Changing this changes the public link."}
      </p>
      {problem ? (
        <p id={errorId} className="mt-1 text-xs text-ponderosa">
          {problem}
        </p>
      ) : (
        !isNew &&
        values.slug &&
        slugDisagreesWithTitle(values.title, values.slug) && (
          <p className="mt-1 text-xs text-ash">The web address names words the title does not. Auto makes it from the title.</p>
        )
      )}
    </div>
  );
}

/** Title, web address and description, with what the description suggests. */
export function ListingSection() {
  const { values, update, mode, errors, readOnly } = useEditorForm();
  return (
    <Section id="listing" title="Listing">
      <Field id="ed-title" label="Title" error={errors.title}>
        <EditorTextarea
          singleLine
          value={values.title}
          readOnly={readOnly}
          maxLength={200}
          onChange={(e) => update({ title: e.target.value })}
        />
      </Field>
      {mode !== "submission" && <WebAddress />}
      <Field id="ed-description" label="Description" error={errors.description}>
        <EditorTextarea
          long
          value={values.description}
          readOnly={readOnly}
          className="min-h-32"
          onChange={(e) => update({ description: e.target.value })}
        />
      </Field>
      <FoundInText />
    </Section>
  );
}
