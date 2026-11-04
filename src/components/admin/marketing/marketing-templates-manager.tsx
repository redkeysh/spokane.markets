"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminButton } from "@/components/admin/kit/button";
import { Empty } from "@/components/admin/kit/empty";
import { Field, FieldRow, Section } from "@/components/admin/kit/field";
import { List } from "@/components/admin/kit/list";
import { StaticRow } from "@/components/admin/rare/action-row";
import { FormError, SelectInput, TextArea, TextInput } from "@/components/admin/rare/controls";
import { countWord } from "@/components/admin/rare/words";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { PROFILE_WORDS, SCALE_WORDS, type TemplateProfile } from "./words";

type TemplateItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  profile: TemplateProfile;
  active: boolean;
  defaultScale: number;
  version: number;
  friendlyFilenameStem: string | null;
  assets: Array<{
    id: string;
    kind: "HTML" | "TEXT" | "IMAGE";
    name: string;
    storageKey: string | null;
    updatedAt: string;
  }>;
  _count: { renders: number };
};

const DEFAULT_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; width: 1080px; height: 1080px; font-family: Arial, sans-serif; display: flex; align-items: center; justify-content: center; }
      .card { padding: 48px; text-align: center; }
      h1 { font-size: 82px; margin: 0 0 20px; }
      p { font-size: 36px; margin: 0; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>{{VENDOR_NAME}}</h1>
      <p>{{LISTING_URL}}</p>
    </div>
  </body>
</html>`;

const EMPTY_FORM = {
  slug: "",
  name: "",
  category: "Vendor spotlight",
  profile: "SQUARE" as TemplateProfile,
  defaultScale: "2",
  friendlyFilenameStem: "",
  htmlSource: DEFAULT_HTML,
  captionSource: "",
};

async function fetchTemplates(): Promise<{ templates: TemplateItem[] } | { error: string }> {
  try {
    const res = await fetch("/api/admin/marketing/templates");
    const data = await res.json();
    if (!res.ok) return { error: data?.error?.message ?? "Could not load the templates." };
    return { templates: data.templates ?? [] };
  } catch {
    return { error: "Could not load the templates." };
  }
}

/** The templates graphics are made from, and a form to add one. */
export function MarketingTemplatesManager() {
  const announce = useAnnounce();
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState(EMPTY_FORM);

  function applyTemplates(result: { templates: TemplateItem[] } | { error: string }) {
    if ("error" in result) setError(result.error);
    else setTemplates(result.templates);
    setLoading(false);
  }

  useEffect(() => {
    void fetchTemplates().then(applyTemplates);
  }, []);

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setFormState((prev) => ({ ...prev, [key]: value }));

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        slug: formState.slug.trim(),
        name: formState.name.trim(),
        category: formState.category.trim(),
        profile: formState.profile,
        defaultScale: Number(formState.defaultScale || "2"),
        friendlyFilenameStem: formState.friendlyFilenameStem.trim(),
        safeHtmlPlaceholders: [],
        companionTextKeys: formState.captionSource.trim() ? ["caption"] : [],
        placeholderSchemaJson: [],
        assets: [
          { kind: "HTML", name: "main.html", inlineContent: formState.htmlSource, storageKey: "", mimeType: "text/html" },
          ...(formState.captionSource.trim()
            ? [
                {
                  kind: "TEXT",
                  name: "caption.txt",
                  inlineContent: formState.captionSource,
                  storageKey: "",
                  mimeType: "text/plain",
                },
              ]
            : []),
        ],
      };
      const res = await fetch("/api/admin/marketing/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "The template was not added.");
      applyTemplates(await fetchTemplates());
      const message = `Added ${payload.name || "the template"}.`;
      toast.success(message);
      announce(message);
      setFormState((prev) => ({ ...prev, slug: "", name: "", friendlyFilenameStem: "", captionSource: "" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The template was not added.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-10">
      <Section id="templates" title="Your templates">
        {loading && templates.length === 0 ? (
          <p className="font-text text-sm text-ash" role="status">
            Loading templates.
          </p>
        ) : templates.length === 0 ? (
          <Empty className="py-2" detail="Add one below. Graphics are made from templates.">
            There are no templates yet.
          </Empty>
        ) : (
          <List label="Your templates">
            {templates.map((template) => (
              <StaticRow
                key={template.id}
                title={template.name}
                muted={!template.active}
                meta={
                  <span className="tabular-nums">
                    {[
                      template.category,
                      PROFILE_WORDS[template.profile],
                      `version ${template.version}`,
                      countWord(template.assets.length, "file", "files"),
                      template._count.renders > 0 ? `used ${countWord(template._count.renders, "time", "times")}` : "not used yet",
                    ].join(", ")}
                  </span>
                }
                status={
                  template.active ? undefined : <span className="font-text text-sm font-medium text-ash-quiet">Turned off</span>
                }
              />
            ))}
          </List>
        )}
      </Section>

      <Section id="add-template" title="Add a template">
        <form onSubmit={createTemplate} className="space-y-4" noValidate>
          <FieldRow>
            <Field id="template-name" label="Name" required>
              <TextInput value={formState.name} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field id="template-slug" label="Short name" required help="Letters, numbers and hyphens, such as vendor-spotlight-01.">
              <TextInput value={formState.slug} onChange={(e) => set("slug", e.target.value)} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field id="template-category" label="Category">
              <TextInput value={formState.category} onChange={(e) => set("category", e.target.value)} />
            </Field>
            <Field id="template-file-name" label="File name start" help="The downloaded file's name begins with this.">
              <TextInput value={formState.friendlyFilenameStem} onChange={(e) => set("friendlyFilenameStem", e.target.value)} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field id="template-shape" label="Shape">
              <SelectInput value={formState.profile} onChange={(e) => set("profile", e.target.value as TemplateProfile)}>
                <option value="SQUARE">{PROFILE_WORDS.SQUARE}</option>
                <option value="IG_STORY">{PROFILE_WORDS.IG_STORY}</option>
              </SelectInput>
            </Field>
            <Field id="template-scale" label="Detail">
              <SelectInput value={formState.defaultScale} onChange={(e) => set("defaultScale", e.target.value)}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={String(n)}>
                    {SCALE_WORDS[n]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </FieldRow>
          <Field id="template-html" label="Page" help="HTML for the picture. Put {{PLACEHOLDER}} where words or pictures go.">
            <TextArea
              rows={14}
              spellCheck={false}
              value={formState.htmlSource}
              onChange={(e) => set("htmlSource", e.target.value)}
              className="font-mono text-[13px] leading-[18px]"
            />
          </Field>
          <Field id="template-caption" label="Caption" help="Optional text to post with the picture. {{PLACEHOLDER}} works here too.">
            <TextArea rows={4} value={formState.captionSource} onChange={(e) => set("captionSource", e.target.value)} />
          </Field>
          <FormError>{error}</FormError>
          <div className="flex flex-wrap items-center gap-2">
            <AdminButton type="submit" variant="ink" busy={saving} busyLabel="Adding">
              Add template
            </AdminButton>
          </div>
        </form>
      </Section>
    </div>
  );
}
