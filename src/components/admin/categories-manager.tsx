"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownAZ, ArrowUpAZ, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteButton } from "@/components/admin/action-buttons";
import { slugify } from "@/lib/utils";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/lib/api-client";

type TagWithCount = { id: string; name: string; slug: string; _count: { events: number } };
type FeatureWithCount = { id: string; name: string; slug: string; icon: string | null; _count: { events: number } };

interface CategoriesManagerProps {
  initialTags: TagWithCount[];
  initialFeatures: FeatureWithCount[];
}

export function CategoriesManager({
  initialTags,
  initialFeatures,
}: CategoriesManagerProps) {
  const router = useRouter();
  const [tags, setTags] = useState(initialTags);
  const [features, setFeatures] = useState(initialFeatures);
  const [tagName, setTagName] = useState("");
  const [tagSlug, setTagSlug] = useState("");
  const [featureName, setFeatureName] = useState("");
  const [featureSlug, setFeatureSlug] = useState("");
  const [featureIcon, setFeatureIcon] = useState("");
  const [tagSubmitting, setTagSubmitting] = useState(false);
  const [featureSubmitting, setFeatureSubmitting] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [featureError, setFeatureError] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [editTagSlug, setEditTagSlug] = useState("");
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [editFeatureName, setEditFeatureName] = useState("");
  const [editFeatureSlug, setEditFeatureSlug] = useState("");
  const [editFeatureIcon, setEditFeatureIcon] = useState("");
  const [tagEditSubmitting, setTagEditSubmitting] = useState(false);
  const [featureEditSubmitting, setFeatureEditSubmitting] = useState(false);
  const [tagSortDir, setTagSortDir] = useState<"asc" | "desc">("asc");
  const [featureSortDir, setFeatureSortDir] = useState<"asc" | "desc">("asc");

  const sortedTags = [...tags].sort((a, b) =>
    tagSortDir === "asc"
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name)
  );
  const sortedFeatures = [...features].sort((a, b) =>
    featureSortDir === "asc"
      ? a.name.localeCompare(b.name)
      : b.name.localeCompare(a.name)
  );

  const addTag = async () => {
    const name = tagName.trim();
    const slug = tagSlug.trim() || slugify(name);
    if (!name || !slug) return;
    setTagSubmitting(true);
    setTagError(null);
    try {
      const res = await fetch("/api/admin/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to add tag");
      }
      const newTag = await res.json();
      setTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)));
      setTagName("");
      setTagSlug("");
      router.refresh();
    } catch (e) {
      setTagError(e instanceof Error ? e.message : "Failed to add tag");
    } finally {
      setTagSubmitting(false);
    }
  };

  const deleteTag = async (id: string) => {
    const res = await fetch(`/api/admin/tags/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(getApiErrorMessage(body, "Failed to delete tag."));
      return;
    }
    setTags((prev) => prev.filter((t) => t.id !== id));
    toast.success("Tag deleted.");
    router.refresh();
  };

  const startEditTag = (tag: TagWithCount) => {
    setEditingTagId(tag.id);
    setEditTagName(tag.name);
    setEditTagSlug(tag.slug);
  };

  const cancelEditTag = () => {
    setEditingTagId(null);
    setEditTagName("");
    setEditTagSlug("");
  };

  const updateTag = async () => {
    if (!editingTagId) return;
    const name = editTagName.trim();
    const slug = editTagSlug.trim() || slugify(name);
    if (!name || !slug) return;
    setTagEditSubmitting(true);
    setTagError(null);
    try {
      const res = await fetch(`/api/admin/tags/${editingTagId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to update tag");
      }
      const updated = await res.json();
      setTags((prev) =>
        prev.map((t) => (t.id === editingTagId ? { ...t, ...updated } : t)).sort((a, b) => a.name.localeCompare(b.name))
      );
      cancelEditTag();
      router.refresh();
    } catch (e) {
      setTagError(e instanceof Error ? e.message : "Failed to update tag");
    } finally {
      setTagEditSubmitting(false);
    }
  };

  const addFeature = async () => {
    const name = featureName.trim();
    const slug = featureSlug.trim() || slugify(name);
    if (!name || !slug) return;
    setFeatureSubmitting(true);
    setFeatureError(null);
    try {
      const res = await fetch("/api/admin/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, icon: featureIcon.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to add feature");
      }
      const newFeature = await res.json();
      setFeatures((prev) => [...prev, newFeature].sort((a, b) => a.name.localeCompare(b.name)));
      setFeatureName("");
      setFeatureSlug("");
      setFeatureIcon("");
      router.refresh();
    } catch (e) {
      setFeatureError(e instanceof Error ? e.message : "Failed to add feature");
    } finally {
      setFeatureSubmitting(false);
    }
  };

  const deleteFeature = async (id: string) => {
    const res = await fetch(`/api/admin/features/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(getApiErrorMessage(body, "Failed to delete feature."));
      return;
    }
    setFeatures((prev) => prev.filter((f) => f.id !== id));
    toast.success("Feature deleted.");
    router.refresh();
  };

  const startEditFeature = (feature: FeatureWithCount) => {
    setEditingFeatureId(feature.id);
    setEditFeatureName(feature.name);
    setEditFeatureSlug(feature.slug);
    setEditFeatureIcon(feature.icon ?? "");
  };

  const cancelEditFeature = () => {
    setEditingFeatureId(null);
    setEditFeatureName("");
    setEditFeatureSlug("");
    setEditFeatureIcon("");
  };

  const updateFeature = async () => {
    if (!editingFeatureId) return;
    const name = editFeatureName.trim();
    const slug = editFeatureSlug.trim() || slugify(name);
    if (!name || !slug) return;
    setFeatureEditSubmitting(true);
    setFeatureError(null);
    try {
      const res = await fetch(`/api/admin/features/${editingFeatureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug, icon: editFeatureIcon.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? "Failed to update feature");
      }
      const updated = await res.json();
      setFeatures((prev) =>
        prev.map((f) => (f.id === editingFeatureId ? { ...f, ...updated } : f)).sort((a, b) => a.name.localeCompare(b.name))
      );
      cancelEditFeature();
      router.refresh();
    } catch (e) {
      setFeatureError(e instanceof Error ? e.message : "Failed to update feature");
    } finally {
      setFeatureEditSubmitting(false);
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      {/* Event Types (Tags) */}
      <section className="rounded-lg border border-border p-6">
        <h2 className="text-xl font-semibold">Event Types</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What kind of event: Farmers Market, Craft Fair, Flea Market, etc.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            placeholder="Name (e.g. Farmers Market)"
            value={tagName}
            onChange={(e) => {
              setTagName(e.target.value);
              if (!tagSlug) setTagSlug(slugify(e.target.value));
            }}
            className="w-40"
          />
          <Input
            placeholder="Slug (auto)"
            value={tagSlug}
            onChange={(e) => setTagSlug(e.target.value)}
            className="w-32"
          />
          <Button
            size="sm"
            onClick={addTag}
            disabled={!tagName.trim() || tagSubmitting}
          >
            {tagSubmitting ? "Adding…" : "Add"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTagSortDir((prev) => (prev === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-1.5"
          >
            {tagSortDir === "asc" ? (
              <>
                <ArrowUpAZ className="h-4 w-4" />
                A-Z
              </>
            ) : (
              <>
                <ArrowDownAZ className="h-4 w-4" />
                Z-A
              </>
            )}
          </Button>
        </div>
        {tagError && (
          <p className="mt-2 text-sm text-destructive">{tagError}</p>
        )}
        <ul className="mt-4 space-y-2">
          {sortedTags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              {editingTagId === tag.id ? (
                <>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input
                      value={editTagName}
                      onChange={(e) => {
                        setEditTagName(e.target.value);
                        if (!editTagSlug) setEditTagSlug(slugify(e.target.value));
                      }}
                      placeholder="Name"
                      className="h-8 w-36"
                    />
                    <Input
                      value={editTagSlug}
                      onChange={(e) => setEditTagSlug(e.target.value)}
                      placeholder="Slug"
                      className="h-8 w-28"
                    />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={cancelEditTag}
                      disabled={tagEditSubmitting}
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={updateTag}
                      disabled={!editTagName.trim() || tagEditSubmitting}
                    >
                      {tagEditSubmitting ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => startEditTag(tag)}
                    className="font-medium text-left"
                  >
                    {tag.name}
                  </button>
                  <div className="flex items-center gap-2" data-row-action>
                    <span className="text-xs text-muted-foreground">
                      {tag.slug} · {tag._count.events} events
                    </span>
                    <DeleteButton
                      action={() => deleteTag(tag.id)}
                      title="Delete event type"
                      description={`Delete "${tag.name}"? Events using it will be updated.`}
                      iconOnly
                    />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Features & Amenities */}
      <section className="rounded-lg border border-border p-6">
        <h2 className="text-xl font-semibold">Features & Amenities</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Venue/event attributes: Indoor, WiFi Available, Power Available, etc.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Input
            placeholder="Name (e.g. WiFi Available)"
            value={featureName}
            onChange={(e) => {
              setFeatureName(e.target.value);
              if (!featureSlug) setFeatureSlug(slugify(e.target.value));
            }}
            className="w-40"
          />
          <Input
            placeholder="Slug (auto)"
            value={featureSlug}
            onChange={(e) => setFeatureSlug(e.target.value)}
            className="w-32"
          />
          <Input
            placeholder="Icon (emoji)"
            value={featureIcon}
            onChange={(e) => setFeatureIcon(e.target.value)}
            className="w-20"
          />
          <Button
            size="sm"
            onClick={addFeature}
            disabled={!featureName.trim() || featureSubmitting}
          >
            {featureSubmitting ? "Adding…" : "Add"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setFeatureSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
            }
            className="inline-flex items-center gap-1.5"
          >
            {featureSortDir === "asc" ? (
              <>
                <ArrowUpAZ className="h-4 w-4" />
                A-Z
              </>
            ) : (
              <>
                <ArrowDownAZ className="h-4 w-4" />
                Z-A
              </>
            )}
          </Button>
        </div>
        {featureError && (
          <p className="mt-2 text-sm text-destructive">{featureError}</p>
        )}
        <ul className="mt-4 space-y-2">
          {sortedFeatures.map((feature) => (
            <li
              key={feature.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
            >
              {editingFeatureId === feature.id ? (
                <>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input
                      value={editFeatureName}
                      onChange={(e) => {
                        setEditFeatureName(e.target.value);
                        if (!editFeatureSlug) setEditFeatureSlug(slugify(e.target.value));
                      }}
                      placeholder="Name"
                      className="h-8 w-36"
                    />
                    <Input
                      value={editFeatureSlug}
                      onChange={(e) => setEditFeatureSlug(e.target.value)}
                      placeholder="Slug"
                      className="h-8 w-28"
                    />
                    <Input
                      value={editFeatureIcon}
                      onChange={(e) => setEditFeatureIcon(e.target.value)}
                      placeholder="Icon"
                      className="h-8 w-16"
                    />
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={cancelEditFeature}
                      disabled={featureEditSubmitting}
                      aria-label="Cancel"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={updateFeature}
                      disabled={!editFeatureName.trim() || featureEditSubmitting}
                    >
                      {featureEditSubmitting ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => startEditFeature(feature)}
                    className="font-medium text-left"
                  >
                    {feature.icon && <span className="mr-1">{feature.icon}</span>}
                    {feature.name}
                  </button>
                  <div className="flex items-center gap-2" data-row-action>
                    <span className="text-xs text-muted-foreground">
                      {feature.slug} · {feature._count.events} events
                    </span>
                    <DeleteButton
                      action={() => deleteFeature(feature.id)}
                      title="Delete feature/amenity"
                      description={`Delete "${feature.name}"? Events using it will be updated.`}
                      iconOnly
                    />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
