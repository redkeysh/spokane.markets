"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminButton } from "@/components/admin/kit/button";
import { FormError } from "@/components/admin/site/inputs";
import { useUnsavedSection } from "@/components/admin/site/unsaved";
import { resetBanner, setBannerFocus, setBannerImage } from "@/app/admin/_actions/site";
import type { BannerKey } from "@/lib/banner-config";
import { settle } from "@/lib/admin/settle";
import { clampFocal } from "@/lib/site/settings-input";
import { isBannerUnoptimized } from "@/lib/utils";

const ACCEPTED = "image/jpeg,image/png,image/webp,image/gif";

/**
 * One banner picture, named by the page it shows on. Replace uploads a new picture; clicking the
 * picture, or the two sliders under Focal point, moves the point that cropped layouts keep in view.
 */
export function BannerEditor({
  bannerKey,
  label,
  detail,
  currentUrl,
  currentFocalX,
  currentFocalY,
  isCustom,
}: {
  bannerKey: BannerKey;
  label: string;
  detail: string;
  currentUrl: string;
  currentFocalX: number;
  currentFocalY: number;
  isCustom: boolean;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [focus, setFocus] = React.useState({ x: currentFocalX, y: currentFocalY });
  const [savedFocus, setSavedFocus] = React.useState({ x: currentFocalX, y: currentFocalY });
  const [busy, setBusy] = React.useState<null | "upload" | "focus" | "reset">(null);
  const [error, setError] = React.useState<string | null>(null);
  const focusChanged = focus.x !== savedFocus.x || focus.y !== savedFocus.y;
  const headingId = `banner-${bannerKey}`;
  useUnsavedSection(headingId, `${label} banner`, focusChanged);

  const [broken, setBroken] = React.useState(false);
  const [seenUrl, setSeenUrl] = React.useState(currentUrl);
  if (seenUrl !== currentUrl) {
    setSeenUrl(currentUrl);
    setBroken(false);
    setFocus({ x: currentFocalX, y: currentFocalY });
    setSavedFocus({ x: currentFocalX, y: currentFocalY });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy("upload");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/upload/image?type=banner", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "The upload did not finish. Try again.");
      const result = await setBannerImage(bannerKey, data.url);
      if (!result.ok) throw new Error(result.error);
      toast.success(`${label} banner replaced.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload did not finish. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveFocus() {
    setError(null);
    setBusy("focus");
    const result = await settle(setBannerFocus(bannerKey, focus));
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedFocus(focus);
    toast.success(`${label} banner focal point saved.`);
    router.refresh();
  }

  async function reset() {
    setError(null);
    setBusy("reset");
    const result = await settle(resetBanner(bannerKey));
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.success(`${label} banner is back to the built-in picture.`);
    router.refresh();
  }

  function onPictureClick(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    setFocus({
      x: clampFocal(((e.clientX - box.left) / box.width) * 100),
      y: clampFocal(((e.clientY - box.top) / box.height) * 100),
    });
  }

  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div
        onClick={onPictureClick}
        className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-sm border border-seam bg-fog"
      >
        {broken ? (
          <p className="flex h-full items-center justify-center px-4 text-center text-xs text-ash">
            This picture did not load. Replace it, or check the link.
          </p>
        ) : (
          <Image
            src={currentUrl}
            alt=""
            fill
            className="object-cover"
            style={{ objectPosition: `${focus.x}% ${focus.y}%` }}
            unoptimized={isBannerUnoptimized(currentUrl)}
            sizes="(max-width: 768px) 100vw, 400px"
            onError={() => setBroken(true)}
          />
        )}
        <span
          aria-hidden="true"
          hidden={broken}
          className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgb(0_0_0/0.55)]"
          style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
        />
      </div>
      <h3 id={headingId} className="mt-2 text-sm font-medium text-basalt">
        {label}
      </h3>
      <p className="text-xs text-ash">
        {detail} {isCustom ? "Your picture." : "The built-in picture."}
      </p>

      <details className="mt-2">
        <summary className="w-fit cursor-pointer rounded-sm text-xs font-medium text-lilac">
          Focal point <span className="text-ash tabular-nums">({focus.x}% across, {focus.y}% down)</span>
        </summary>
        <div className="mt-2 grid gap-2">
          <label className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2 text-xs text-ash">
            Across
            <input
              type="range"
              min={0}
              max={100}
              value={focus.x}
              aria-label={`${label} focal point across`}
              onChange={(e) => setFocus((f) => ({ ...f, x: clampFocal(Number(e.target.value)) }))}
              className="h-6 accent-basalt"
            />
          </label>
          <label className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2 text-xs text-ash">
            Down
            <input
              type="range"
              min={0}
              max={100}
              value={focus.y}
              aria-label={`${label} focal point down`}
              onChange={(e) => setFocus((f) => ({ ...f, y: clampFocal(Number(e.target.value)) }))}
              className="h-6 accent-basalt"
            />
          </label>
        </div>
      </details>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {focusChanged ? (
          <>
            <AdminButton variant="ink" size="sm" onClick={saveFocus} busy={busy === "focus"} busyLabel="Saving">
              Save focal point
            </AdminButton>
            <AdminButton variant="quiet" size="sm" onClick={() => setFocus(savedFocus)} disabled={busy !== null}>
              Cancel
            </AdminButton>
          </>
        ) : (
          <>
            <AdminButton
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              busy={busy === "upload"}
              busyLabel="Uploading"
              disabled={busy !== null}
              aria-describedby={headingId}
            >
              Replace picture
            </AdminButton>
            {isCustom && (
              <AdminButton variant="quiet" size="sm" onClick={reset} busy={busy === "reset"} busyLabel="Resetting" disabled={busy !== null} aria-describedby={headingId}>
                Use the built-in picture
              </AdminButton>
            )}
          </>
        )}
        <input ref={inputRef} type="file" accept={ACCEPTED} className="hidden" onChange={onFile} tabIndex={-1} aria-hidden="true" />
      </div>
      <FormError className="mt-1 text-xs">{error}</FormError>
    </section>
  );
}
