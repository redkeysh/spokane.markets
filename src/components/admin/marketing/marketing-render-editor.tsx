"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { MarketingPlaceholderDefinition } from "@/lib/marketing/types";
import { AdminStickyActionBar } from "@/components/admin/admin-form-layout";
import { AdminButton, AdminLinkButton } from "@/components/admin/kit/button";
import { Field, FieldRow, Section } from "@/components/admin/kit/field";
import { LeavePrompt } from "@/components/admin/kit/save-bar";
import { CheckboxField, FormError, SelectInput, TextArea, TextInput } from "@/components/admin/rare/controls";
import { useLeavePrompt } from "@/components/admin/shell/leave-guard";
import { useAnnounce } from "@/components/admin/shell/live-region";
import { PROFILE_WORDS, SCALE_WORDS, type TemplateProfile } from "./words";

type TemplateListItem = {
  id: string;
  slug: string;
  name: string;
  category: string;
  profile: TemplateProfile;
  defaultScale: number;
  active: boolean;
};

type TemplateDetail = TemplateListItem & {
  safeHtmlPlaceholders: string[];
  companionTextKeys: string[];
  placeholderSchemaJson: { placeholders?: MarketingPlaceholderDefinition[] } | null;
  assets: Array<{
    id: string;
    kind: "HTML" | "TEXT" | "IMAGE";
    name: string;
    inlineContent: string | null;
    storageKey: string | null;
  }>;
};

type EntityResult = { id: string; label: string; subtitle?: string };
type EntityKind = "vendor" | "event" | "market";

const ENTITY_WORDS: Record<EntityKind, { label: string; plural: string }> = {
  vendor: { label: "Vendor", plural: "vendors" },
  event: { label: "Event", plural: "events" },
  market: { label: "Market", plural: "markets" },
};

function normalizePlaceholderSchema(template: TemplateDetail | null): MarketingPlaceholderDefinition[] {
  const raw = template?.placeholderSchemaJson;
  if (!raw || !Array.isArray(raw.placeholders)) return [];
  return raw.placeholders;
}

/** Choose a template, fill it in from a record or by hand, and queue the graphic. */
export function MarketingRenderEditor({ initialEvent }: { initialEvent?: EntityResult } = {}) {
  const searchParams = useSearchParams();
  const announce = useAnnounce();
  const initialTemplateId = searchParams.get("templateId") ?? "";
  const duplicateRenderId = searchParams.get("duplicateRenderId") ?? "";
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(initialTemplateId);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateDetail | null>(null);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [scale, setScale] = useState("2");
  const [entityIds, setEntityIds] = useState<Record<EntityKind, string>>({ vendor: "", event: initialEvent?.id ?? "", market: "" });
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([]);
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; status: string } | null>(null);
  const [entitySearch, setEntitySearch] = useState<Record<EntityKind, string>>({ vendor: "", event: "", market: "" });
  const [entityResults, setEntityResults] = useState<Record<EntityKind, EntityResult[]>>({
    vendor: [],
    event: initialEvent ? [initialEvent] : [],
    market: [],
  });

  const placeholderDefs = useMemo(() => normalizePlaceholderSchema(selectedTemplate), [selectedTemplate]);
  /** The words and pictures of the last graphic started, so leaving after it does not ask. */
  const [made, setMade] = useState("{}");
  const filled = Object.values(variables).some((v) => v.trim() !== "");
  const { leaving, stay, go } = useLeavePrompt(filled && JSON.stringify(variables) !== made, "/admin/marketing/asset-studio");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/marketing/templates");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setTemplates((data.templates ?? []) as TemplateListItem[]);
    })();
    void (async () => {
      const res = await fetch("/api/admin/marketing/folders");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setFolders(data.folders ?? []);
    })();
    void (async () => {
      const res = await fetch("/api/admin/marketing/tags");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setTags(data.tags ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!selectedTemplateId) return;
    void (async () => {
      const res = await fetch(`/api/admin/marketing/templates/${selectedTemplateId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not load the template.");
        return;
      }
      const template = data as TemplateDetail;
      setSelectedTemplate(template);
      setScale(String(template.defaultScale ?? 2));
      const defs = normalizePlaceholderSchema(template);
      setVariables((prev) => {
        const nextVars: Record<string, string> = {};
        for (const def of defs) nextVars[def.key] = prev[def.key] ?? "";
        return nextVars;
      });
    })();
  }, [selectedTemplateId]);

  useEffect(() => {
    if (!duplicateRenderId) return;
    void (async () => {
      const res = await fetch(`/api/admin/marketing/renders/${duplicateRenderId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const render = data as {
        templateId: string;
        variablesJson: Record<string, string>;
        scale: number;
        vendorId: string | null;
        eventId: string | null;
        marketId: string | null;
        folders: Array<{ folderId: string }>;
        tags: Array<{ tagId: string }>;
      };
      setSelectedTemplateId(render.templateId);
      setVariables(render.variablesJson ?? {});
      setScale(String(render.scale ?? 2));
      setEntityIds({ vendor: render.vendorId ?? "", event: render.eventId ?? "", market: render.marketId ?? "" });
      setFolderIds((render.folders ?? []).map((f) => f.folderId));
      setTagIds((render.tags ?? []).map((t) => t.tagId));
    })();
  }, [duplicateRenderId]);

  async function fetchEntity(kind: EntityKind, q: string) {
    if (!q.trim()) {
      setEntityResults((prev) => ({ ...prev, [kind]: [] }));
      return;
    }
    const res = await fetch(`/api/admin/marketing/entities?kind=${kind}&q=${encodeURIComponent(q)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const items = (data.items ?? []) as EntityResult[];
    setEntityResults((prev) => ({ ...prev, [kind]: items }));
    announce(items.length === 0 ? `No ${ENTITY_WORDS[kind].plural} match.` : `${items.length} ${ENTITY_WORDS[kind].plural} found.`);
  }

  async function prefillFromEntities() {
    if (!entityIds.vendor && !entityIds.event && !entityIds.market) {
      setError("Choose a vendor, event or market first.");
      return;
    }
    setPrefilling(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        mode: "prefill",
        ...(entityIds.vendor ? { vendorId: entityIds.vendor } : {}),
        ...(entityIds.event ? { eventId: entityIds.event } : {}),
        ...(entityIds.market ? { marketId: entityIds.market } : {}),
      });
      const res = await fetch(`/api/admin/marketing/entities?${query.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not fill in from that record.");
        return;
      }
      setVariables((prev) => ({ ...prev, ...(data.variables ?? {}) }));
      announce("Filled in the words and pictures.");
    } finally {
      setPrefilling(false);
    }
  }

  async function uploadForPlaceholder(key: string, file: File) {
    const formData = new FormData();
    formData.set("file", file);
    const res = await fetch("/api/upload/image?type=banner", { method: "POST", body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
      setError(data?.error ?? "The picture did not upload.");
      return;
    }
    setVariables((prev) => ({ ...prev, [key]: data.url as string }));
  }

  async function submitRender(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate) {
      setError("Choose a template first.");
      return;
    }
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        templateId: selectedTemplate.id,
        variables,
        entityRefs: {
          vendorId: entityIds.vendor || undefined,
          eventId: entityIds.event || undefined,
          marketId: entityIds.market || undefined,
        },
        scale: Number(scale || "2"),
        folderIds,
        tagIds,
      };
      const res = await fetch("/api/admin/marketing/renders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "The graphic was not started.");
      setResult(data as { id: string; status: string });
      setMade(JSON.stringify(variables));
      announce("The graphic is being made. It will be in Past graphics.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The graphic was not started.");
    } finally {
      setSaving(false);
    }
  }

  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

  return (
    <form onSubmit={submitRender} noValidate>
      <div className="max-w-[984px] space-y-8">
        <Section id="template" title="Template">
          <FieldRow>
            <Field id="graphic-template" label="Template" required>
              <SelectInput
                value={selectedTemplateId}
                onChange={(e) => {
                  setSelectedTemplateId(e.target.value);
                  if (!e.target.value) setSelectedTemplate(null);
                }}
              >
                <option value="">Choose a template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}, {template.category}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="graphic-scale" label="Detail" help="Higher detail makes a larger, sharper file.">
              <SelectInput value={scale} onChange={(e) => setScale(e.target.value)}>
                {[1, 2, 3].map((n) => (
                  <option key={n} value={String(n)}>
                    {SCALE_WORDS[n]}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </FieldRow>
          {selectedTemplate && (
            <p className="font-text text-sm text-ash">
              {PROFILE_WORDS[selectedTemplate.profile]}. {placeholderDefs.length === 1 ? "1 thing" : `${placeholderDefs.length} things`} to
              fill in.
            </p>
          )}
        </Section>

        <Section id="fill-from" title="Fill in from a record">
          <p className="-mt-1 max-w-[72ch] font-text text-sm text-ash">
            Optional. Find a vendor, event or market, then fill the words and pictures in from it.
          </p>
          <div className="grid gap-6 lg:grid-cols-3">
            {(Object.keys(ENTITY_WORDS) as EntityKind[]).map((kind) => (
              <div key={kind} className="min-w-0 space-y-2">
                <label htmlFor={`find-${kind}`} className="block font-text text-sm font-medium text-basalt">
                  {ENTITY_WORDS[kind].label}
                </label>
                <div className="flex gap-2">
                  <TextInput
                    id={`find-${kind}`}
                    type="search"
                    placeholder={`Search ${ENTITY_WORDS[kind].plural}`}
                    value={entitySearch[kind]}
                    onChange={(e) => setEntitySearch((prev) => ({ ...prev, [kind]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void fetchEntity(kind, entitySearch[kind]);
                      }
                    }}
                  />
                  <AdminButton variant="outline" onClick={() => void fetchEntity(kind, entitySearch[kind])}>
                    Find
                  </AdminButton>
                </div>
                <SelectInput
                  aria-label={`Chosen ${ENTITY_WORDS[kind].label.toLowerCase()}`}
                  value={entityIds[kind]}
                  onChange={(e) => setEntityIds((prev) => ({ ...prev, [kind]: e.target.value }))}
                >
                  <option value="">None chosen</option>
                  {entityResults[kind].map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                      {item.subtitle ? `, ${item.subtitle}` : ""}
                    </option>
                  ))}
                </SelectInput>
              </div>
            ))}
          </div>
          <div>
            <AdminButton variant="outline" onClick={() => void prefillFromEntities()} busy={prefilling} busyLabel="Filling in">
              Fill in from the chosen records
            </AdminButton>
          </div>
        </Section>

        <Section id="words" title="Words and pictures">
          {!selectedTemplate ? (
            <p className="font-text text-sm text-ash">Choose a template to see what it needs.</p>
          ) : placeholderDefs.length === 0 ? (
            <p className="font-text text-sm text-ash">This template has nothing to fill in.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {placeholderDefs.map((def) => {
                const type = def.type ?? "text";
                const key = def.key;
                const value = variables[key] ?? "";
                const id = `placeholder-${key}`;
                return (
                  <div key={key} className={type === "textarea" || type === "html" ? "md:col-span-2" : undefined}>
                    <Field id={id} label={def.label} help={def.helpText ?? undefined} required={Boolean(def.required)}>
                      {type === "textarea" || type === "html" ? (
                        <TextArea rows={4} value={value} onChange={(e) => setVariables((prev) => ({ ...prev, [key]: e.target.value }))} />
                      ) : (
                        <TextInput
                          value={value}
                          type={type === "url" || type === "image" ? "url" : "text"}
                          onChange={(e) => setVariables((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      )}
                    </Field>
                    {type === "image" && (
                      <div className="mt-2">
                        <label htmlFor={`${id}-file`} className="font-text text-xs text-ash">
                          Or upload a picture
                        </label>
                        <input
                          id={`${id}-file`}
                          type="file"
                          accept="image/*"
                          className="mt-1 block w-full font-text text-sm text-basalt file:mr-3 file:h-[30px] file:cursor-pointer file:rounded-md file:border file:border-seam-strong file:bg-sheet file:px-3 file:font-text file:text-sm file:font-medium file:text-basalt hover:file:bg-hover"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadForPlaceholder(key, file);
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section id="filing" title="Folders and tags">
          <div className="grid gap-6 md:grid-cols-2">
            <fieldset>
              <legend className="font-text text-sm font-medium text-basalt">Folders</legend>
              <div className="mt-2 flex flex-col gap-1.5">
                {folders.length === 0 ? (
                  <p className="font-text text-sm text-ash">No folders yet.</p>
                ) : (
                  folders.map((folder) => (
                    <CheckboxField
                      key={folder.id}
                      checked={folderIds.includes(folder.id)}
                      onCheckedChange={(on) => setFolderIds((prev) => toggle(prev, folder.id, on))}
                    >
                      {folder.name}
                    </CheckboxField>
                  ))
                )}
              </div>
            </fieldset>
            <fieldset>
              <legend className="font-text text-sm font-medium text-basalt">Tags</legend>
              <div className="mt-2 flex flex-col gap-1.5">
                {tags.length === 0 ? (
                  <p className="font-text text-sm text-ash">No tags yet.</p>
                ) : (
                  tags.map((tag) => (
                    <CheckboxField
                      key={tag.id}
                      checked={tagIds.includes(tag.id)}
                      onCheckedChange={(on) => setTagIds((prev) => toggle(prev, tag.id, on))}
                    >
                      {tag.name}
                    </CheckboxField>
                  ))
                )}
              </div>
            </fieldset>
          </div>
        </Section>

        <FormError>{error}</FormError>
        {result && (
          <p role="status" className="font-text text-sm text-basalt">
            The graphic is being made.{" "}
            <Link
              href={`/admin/marketing/asset-studio/history?renderId=${result.id}`}
              className="rounded-sm text-lilac underline-offset-4 hover:underline"
            >
              See it in Past graphics
            </Link>
          </p>
        )}

      </div>

      <AdminStickyActionBar className="flex flex-wrap items-center gap-2">
        {leaving ? (
          <LeavePrompt question="Leave without making the graphic?" onStay={stay} onDiscard={() => go(leaving)} className="w-full" />
        ) : (
          <>
            <AdminButton type="submit" variant="ink" busy={saving} busyLabel="Starting">
              Make the graphic
            </AdminButton>
            <AdminLinkButton href="/admin/marketing/asset-studio/history" variant="quiet">
              Past graphics
            </AdminLinkButton>
          </>
        )}
      </AdminStickyActionBar>
    </form>
  );
}
