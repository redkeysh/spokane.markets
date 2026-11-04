"use client";

import * as React from "react";
import Image from "next/image";
import { Plus, X } from "lucide-react";
import { AdminButton } from "@/components/admin/kit/button";
import { Tooltip } from "@/components/admin/kit/tooltip";
import { FormError } from "@/components/admin/site/inputs";
import { GALLERY_URL_MAX } from "@/lib/gallery-urls";
import { cn, isBannerUnoptimized } from "@/lib/utils";

const ACCEPTED = "image/jpeg,image/png,image/webp,image/gif";

/**
 * The vendor's gallery as pictures, not links: add several at once (or drop them on the add
 * tile), remove any one. Uploads go through the same endpoint as every vendor picture. Removing
 * a picture moves focus to the next Remove button, or to Add pictures after the last one.
 */
export function GalleryField({
  id,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
  error?: string;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const list = React.useRef<HTMLUListElement>(null);
  const addButton = React.useRef<HTMLButtonElement>(null);
  const focusAfterRemove = React.useRef<number | null>(null);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const room = GALLERY_URL_MAX - value.length;
  const helpId = `${id}-help`;

  async function upload(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    const take = files.slice(0, Math.max(0, room));
    setUploadError(files.length > take.length ? `Only ${take.length} more ${take.length === 1 ? "picture fits" : "pictures fit"}; the rest were left out.` : null);
    if (take.length === 0) return;
    const added: string[] = [];
    setProgress({ done: 0, total: take.length });
    try {
      for (const file of take) {
        const body = new FormData();
        body.set("file", file);
        const res = await fetch("/api/upload/image?type=vendor", { method: "POST", body });
        const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error ?? "A picture did not upload. Try again.");
        added.push(data.url);
        setProgress({ done: added.length, total: take.length });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "A picture did not upload. Try again.");
    } finally {
      if (added.length) onChange([...value, ...added].slice(0, GALLERY_URL_MAX));
      setProgress(null);
    }
  }

  const busy = progress !== null;

  React.useEffect(() => {
    const index = focusAfterRemove.current;
    if (index === null) return;
    focusAfterRemove.current = null;
    const removes = list.current?.querySelectorAll<HTMLButtonElement>("[data-gallery-remove]");
    (removes?.[index] ?? addButton.current)?.focus();
  }, [value.length]);

  const remove = (index: number) => {
    focusAfterRemove.current = index;
    onChange(value.filter((_, j) => j !== index));
  };

  return (
    <div id={id} tabIndex={-1} role="group" aria-labelledby={`${id}-label`} aria-describedby={helpId}>
      <p id={`${id}-label`} className="text-sm font-medium text-basalt">
        Gallery
      </p>
      <p id={helpId} className="mt-0.5 text-xs text-ash tabular-nums">
        Pictures of their goods or their stall. {value.length} of {GALLERY_URL_MAX}.
      </p>
      <ul ref={list} className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
        {value.map((url, i) => (
          <li key={`${url}-${i}`} className="relative aspect-square overflow-hidden rounded-sm border border-seam bg-fog">
            <Image src={url} alt={`Gallery picture ${i + 1}`} fill className="object-cover" unoptimized={isBannerUnoptimized(url)} sizes="160px" />
            <Tooltip content="Remove">
              <AdminButton
                variant="outline"
                size="icon-sm"
                aria-label={`Remove gallery picture ${i + 1}`}
                data-gallery-remove
                disabled={disabled || busy}
                onClick={() => remove(i)}
                className="absolute top-1.5 right-1.5"
              >
                <X strokeWidth={1.75} aria-hidden="true" />
              </AdminButton>
            </Tooltip>
          </li>
        ))}
        {room > 0 && (
          <li>
            <button
              ref={addButton}
              type="button"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!disabled && !busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!disabled && !busy && e.dataTransfer.files.length) void upload(e.dataTransfer.files);
              }}
              className={cn(
                "flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed border-seam-strong px-2 text-center text-sm text-ash transition-colors duration-[80ms] hover:bg-hover hover:text-basalt disabled:opacity-50",
                dragging && "bg-lilac-tint text-basalt"
              )}
            >
              <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {busy ? (
                <span className="tabular-nums">
                  Uploading {Math.min(progress.done + 1, progress.total)} of {progress.total}
                </span>
              ) : (
                <span>Add pictures</span>
              )}
            </button>
          </li>
        )}
      </ul>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED}
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files;
          if (files) void upload(files);
          e.target.value = "";
        }}
      />
      <FormError className="mt-1 text-xs">{uploadError ?? error}</FormError>
    </div>
  );
}
