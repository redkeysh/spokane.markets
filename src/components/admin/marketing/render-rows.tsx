import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/lib/admin/format";
import { List } from "@/components/admin/kit/list";
import { RenderActions } from "./render-actions";
import { RENDER_STATUS_WORDS, renderSubject, scaleWord, type RenderStatus } from "./words";

export type RenderRowData = {
  id: string;
  createdAt: Date;
  status: RenderStatus;
  scale: number;
  template: { name: string };
  user: { name: string | null; email: string | null };
  vendor?: { businessName: string } | null;
  event?: { title: string } | null;
  market?: { name: string } | null;
};

/**
 * Past graphics, newest first. A ready graphic's name downloads it; the menu makes another like
 * it or deletes it. `focusedId` marks the graphic a link pointed to.
 */
export function RenderRows({
  renders,
  label,
  focusedId,
}: {
  renders: readonly RenderRowData[];
  label: string;
  focusedId?: string;
}) {
  return (
    <List label={label}>
      {renders.map((render) => {
        const status = RENDER_STATUS_WORDS[render.status];
        const subject = renderSubject(render);
        const by = render.user.name ?? render.user.email ?? "someone";
        const meta = [subject ? `for ${subject}` : "filled in by hand", `made by ${by}`, formatTimestamp(render.createdAt), scaleWord(render.scale)].join(", ");
        const ready = render.status === "SUCCEEDED";
        const focused = render.id === focusedId;
        return (
          <li
            key={render.id}
            aria-current={focused ? "true" : undefined}
            className={cn(
              "sm-row flex min-h-14 items-center gap-3 border-b border-seam px-4 py-2",
              focused ? "bg-lilac-tint" : "bg-sheet hover:bg-hover"
            )}
          >
            <div className="min-w-0 flex-1">
              {ready ? (
                <a
                  href={`/api/admin/marketing/renders/${render.id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  data-roving-item
                  data-row-key={render.id}
                  className="sm-row-link block font-text text-sm font-medium break-words text-basalt"
                >
                  <span className="sr-only">Download </span>
                  {render.template.name}
                </a>
              ) : (
                <p className="font-text text-sm font-medium break-words text-basalt">{render.template.name}</p>
              )}
              <p className="mt-0.5 font-text text-xs text-ash tabular-nums">{meta}</p>
            </div>
            <span className={cn("shrink-0 font-text text-sm font-medium", status.className)}>{status.word}</span>
            <div data-row-action className="shrink-0">
              <RenderActions renderId={render.id} name={render.template.name} />
            </div>
          </li>
        );
      })}
    </List>
  );
}
