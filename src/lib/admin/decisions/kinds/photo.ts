import type { Decision, DecisionContext } from "../types";

/** Waiting photos, one decision each, oldest first. P shows the photo on the site, X rejects it. */
export function find(ctx: DecisionContext): Decision[] {
  return (ctx.input.publicItems?.photos ?? []).map((photo) => {
    const title = photo.target ? `Photo for ${photo.target}` : "Photo for a listing that is gone";
    return {
      key: `photo:${photo.id}`,
      kind: "photo" as const,
      lane: "public" as const,
      title,
      detail: `Sent by ${photo.uploader}`,
      rows: [{ type: "photo" as const, id: photo.id, title, status: "PENDING" }],
      settles: [],
      sentAt: photo.createdAt.toISOString(),
      primary: { label: "Show photo", action: "approve" as const },
    };
  });
}
