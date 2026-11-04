"use client";

import * as React from "react";
import { Field, Section } from "@/components/admin/kit/field";
import { EditorInput } from "../controls";
import { useEditorForm } from "../form-context";
import { isWebAddress, normalizeLink } from "../model";

const LINKS = [
  { key: "websiteUrl", kind: "website", label: "Website", placeholder: "example.com" },
  { key: "facebookUrl", kind: "facebook", label: "Facebook", placeholder: "facebook.com/page or @page" },
  { key: "instagramUrl", kind: "instagram", label: "Instagram", placeholder: "@handle" },
] as const;

/** Website, Facebook and Instagram. Bare domains and handles are accepted and saved as https:// links. */
export function LinksSection() {
  const { values, update, readOnly, errors } = useEditorForm();
  return (
    <Section id="links" title="Links">
      {LINKS.map((link) => {
        const raw = values[link.key];
        const normalized = normalizeLink(raw, link.kind);
        const bad = raw.trim() !== "" && !isWebAddress(normalized);
        const help =
          !bad && normalized ? (
            <>
              {normalized !== raw.trim() ? `Saved as ${normalized}. ` : ""}
              <a href={normalized} target="_blank" rel="noreferrer" className="rounded-sm font-medium text-lilac underline-offset-4 hover:underline">
                Open
              </a>
            </>
          ) : undefined;
        return (
          <Field
            key={link.key}
            id={`ed-${link.key}`}
            label={link.label}
            error={bad ? `${link.label} must be a web address, such as example.com.` : errors[link.key]}
            help={help}
          >
            <EditorInput
              value={raw}
              readOnly={readOnly}
              placeholder={link.placeholder}
              inputMode="url"
              spellCheck={false}
              autoCapitalize="off"
              onChange={(e) => update({ [link.key]: e.target.value })}
            />
          </Field>
        );
      })}
    </Section>
  );
}
