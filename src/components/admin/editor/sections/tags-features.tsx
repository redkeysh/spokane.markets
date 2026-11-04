"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { AdminButton } from "@/components/admin/kit/button";
import { ChipToggles } from "@/components/admin/kit/chip-toggles";
import { Section } from "@/components/admin/kit/field";
import { createTagAction } from "@/app/admin/_actions/editor";
import { EditorInput } from "../controls";
import { useEditorForm } from "../form-context";
import type { TagOption } from "../types";

function matches(name: string, query: string): boolean {
  return name.toLowerCase().includes(query.trim().toLowerCase());
}

/** Two chip groups (tags, features) with one filter field and "Create tag". */
export function TagsFeaturesSection({ onTagCreated }: { onTagCreated: (tag: TagOption) => void }) {
  const { values, update, options, readOnly, errors } = useEditorForm();
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const q = query.trim();
  const tags = options.tags.filter((t) => !q || matches(t.name, q) || values.tagIds.includes(t.id));
  const features = options.features.filter((f) => !q || matches(f.name, q) || values.featureIds.includes(f.id));
  const exact = options.tags.some((t) => t.name.toLowerCase() === q.toLowerCase());

  const create = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createTagAction(q);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      onTagCreated(result.tag);
      update({ tagIds: [...new Set([...values.tagIds, result.tag.id])] });
      setQuery("");
    } finally {
      setCreating(false);
    }
  };

  if (readOnly) {
    const chosen = (list: { id: string; name: string }[], ids: string[]) =>
      list
        .filter((item) => ids.includes(item.id))
        .map((item) => item.name)
        .join(", ") || "None";
    return (
      <Section id="tags-and-features" title="Tags and features">
        <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          <dt className="font-medium text-basalt">Tags</dt>
          <dd className="text-basalt">{chosen(options.tags, values.tagIds)}</dd>
          <dt className="font-medium text-basalt">Features</dt>
          <dd className="text-basalt">{chosen(options.features, values.featureIds)}</dd>
        </dl>
      </Section>
    );
  }

  return (
    <Section id="tags-and-features" title="Tags and features">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[300px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ash" strokeWidth={1.75} aria-hidden="true" />
          <label htmlFor="ed-tag-filter" className="sr-only">
            Filter tags and features
          </label>
          <EditorInput
            id="ed-tag-filter"
            value={query}
            placeholder="Filter tags and features"
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        {q.length >= 2 && !exact && (
          <AdminButton variant="outline" size="sm" busy={creating} busyLabel="Creating" onClick={() => void create()}>
            Create tag &ldquo;{q}&rdquo;
          </AdminButton>
        )}
      </div>
      {createError && <p className="text-xs text-ponderosa">{createError}</p>}
      <div>
        <p className="text-sm font-medium text-basalt">Tags</p>
        <div className="mt-1.5">
          {tags.length > 0 ? (
            <ChipToggles
              label="Tags"
              options={tags.map((t) => ({ value: t.id, label: t.name }))}
              value={values.tagIds.filter((id) => tags.some((t) => t.id === id))}
              onChange={(next) => update({ tagIds: [...values.tagIds.filter((id) => !tags.some((t) => t.id === id)), ...next] })}
            />
          ) : (
            <p className="text-sm text-ash">No tags match &ldquo;{q}&rdquo;.</p>
          )}
        </div>
        {errors.tagIds && <p className="mt-1 text-xs text-ponderosa">{errors.tagIds}</p>}
      </div>
      <div>
        <p className="text-sm font-medium text-basalt">Features</p>
        <div className="mt-1.5">
          {features.length > 0 ? (
            <ChipToggles
              label="Features"
              options={features.map((f) => ({ value: f.id, label: f.name }))}
              value={values.featureIds.filter((id) => features.some((f) => f.id === id))}
              onChange={(next) => update({ featureIds: [...values.featureIds.filter((id) => !features.some((f) => f.id === id)), ...next] })}
            />
          ) : (
            <p className="text-sm text-ash">No features match &ldquo;{q}&rdquo;.</p>
          )}
        </div>
        {errors.featureIds && <p className="mt-1 text-xs text-ponderosa">{errors.featureIds}</p>}
      </div>
    </Section>
  );
}
