/** Graphics words: render states and picture shapes as the owner says them. */

export type RenderStatus = "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type TemplateProfile = "SQUARE" | "IG_STORY";

export const RENDER_STATUS_WORDS: Record<RenderStatus, { word: string; className: string }> = {
  QUEUED: { word: "In line", className: "text-ash" },
  PROCESSING: { word: "Being made", className: "text-ash" },
  SUCCEEDED: { word: "Ready", className: "text-basalt" },
  FAILED: { word: "Did not work", className: "text-basalt" },
  CANCELLED: { word: "Cancelled", className: "text-ash-quiet" },
};

export const RENDER_STATUS_ORDER: readonly RenderStatus[] = ["SUCCEEDED", "QUEUED", "PROCESSING", "FAILED", "CANCELLED"];

export const PROFILE_WORDS: Record<TemplateProfile, string> = {
  SQUARE: "Square",
  IG_STORY: "Tall, for stories",
};

export const SCALE_WORDS: Record<number, string> = {
  1: "Standard",
  2: "High, 2x",
  3: "Highest, 3x",
};

export function scaleWord(scale: number): string {
  return SCALE_WORDS[scale] ?? `${scale}x`;
}

/** What a graphic was made for: the vendor, event or market it was filled in from. */
export function renderSubject(render: {
  vendor?: { businessName: string } | null;
  event?: { title: string } | null;
  market?: { name: string } | null;
}): string | null {
  return render.vendor?.businessName || render.event?.title || render.market?.name || null;
}
