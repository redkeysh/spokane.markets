"use client";

import * as React from "react";

const STEP = 5;

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Click the picture to set its focal point (imageFocalX and imageFocalY, 0 to 100); arrow keys
 * move it by 5. The card and banner previews crop around it.
 */
export function FocalPoint({
  src,
  x,
  y,
  onChange,
  readOnly,
}: {
  src: string;
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  readOnly: boolean;
}) {
  const position = `${x}% ${y}%`;
  return (
    <div className="space-y-2">
      <p className="text-xs text-ash">Click the picture to set its focal point; both previews follow.</p>
      <div className="flex flex-wrap items-end gap-4">
        <button
          type="button"
          disabled={readOnly}
          aria-label={`Focal point, ${x}% across and ${y}% down. Arrow keys move it.`}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            onChange(clamp(((e.clientX - rect.left) / rect.width) * 100), clamp(((e.clientY - rect.top) / rect.height) * 100));
          }}
          onKeyDown={(e) => {
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-STEP, 0],
              ArrowRight: [STEP, 0],
              ArrowUp: [0, -STEP],
              ArrowDown: [0, STEP],
            };
            const move = moves[e.key];
            if (!move || e.altKey || e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            onChange(clamp(x + move[0]), clamp(y + move[1]));
          }}
          className="relative aspect-video w-60 max-w-full cursor-crosshair overflow-hidden rounded-md border border-seam-strong bg-fog disabled:cursor-default"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- any host, unoptimized preview */}
          <img src={src} alt="" className="absolute inset-0 size-full object-contain" />
          <span
            aria-hidden="true"
            style={{ left: `${x}%`, top: `${y}%` }}
            className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sheet shadow-[0_0_0_2px_var(--sm-basalt)]"
          />
        </button>
        <figure className="space-y-1">
          <div className="aspect-[4/3] w-28 overflow-hidden rounded-md border border-seam bg-fog">
            {/* eslint-disable-next-line @next/next/no-img-element -- crop preview */}
            <img src={src} alt="" className="size-full object-cover" style={{ objectPosition: position }} />
          </div>
          <figcaption className="text-xs text-ash">Card</figcaption>
        </figure>
        <figure className="space-y-1">
          <div className="aspect-[3/1] w-44 overflow-hidden rounded-md border border-seam bg-fog">
            {/* eslint-disable-next-line @next/next/no-img-element -- crop preview */}
            <img src={src} alt="" className="size-full object-cover" style={{ objectPosition: position }} />
          </div>
          <figcaption className="text-xs text-ash">Banner</figcaption>
        </figure>
      </div>
    </div>
  );
}
