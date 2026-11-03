import { cn } from "@/lib/utils";
import {
  fillingParts,
  glyphParts,
  type StallColor,
  type StallPart,
  type StallShape,
  type StallStatus,
} from "./stall-geometry";

export type { StallStatus };

/**
 * md: 12 x 14. sm: dense rows, 10 x 12. xs: week chips, 8 wide.
 * rail: md at 1280 px and up, sm below.
 * Dense sizes draw the booth square set on displays under 2dppx, where the 10 px scallop
 * smears into a bar (see stall.test.ts); globals.css switches the two groups.
 */
export type StallSize = "md" | "sm" | "xs" | "rail";

const COLOR: Record<StallColor, string> = {
  cedar: "var(--sm-cedar)",
  honey: "var(--sm-honey)",
  "honey-ink": "var(--sm-honey-ink)",
  ponderosa: "var(--sm-ponderosa)",
  ash: "var(--sm-ash)",
  "ash-quiet": "var(--sm-ash-quiet)",
};

function Parts({ parts }: { parts: StallPart[] }) {
  return parts.map((p, i) => (
    <path
      key={i}
      d={p.d}
      data-part={p.role}
      style={{
        fill: p.fill ? COLOR[p.fill] : "none",
        stroke: p.stroke ? COLOR[p.stroke] : "none",
        strokeWidth: p.strokeWidth,
        strokeDasharray: p.dash,
      }}
    />
  ));
}

function Shape({
  status,
  shape,
  filling,
}: {
  status: StallStatus;
  shape: StallShape;
  filling: boolean;
}) {
  if (filling && (status === "PENDING" || status === "DRAFT")) {
    const { base, fill } = fillingParts(status, shape);
    return (
      <>
        <Parts parts={base} />
        <g className="sm-stall-fill">
          <Parts parts={fill} />
        </g>
      </>
    );
  }
  return <Parts parts={glyphParts(status, shape)} />;
}

export function StallGlyph({
  status,
  size = "md",
  reach = false,
  filling = false,
  className,
}: {
  status: StallStatus;
  size?: StallSize;
  /** Lilac ring: one keystroke on the focused decision will settle this stall. */
  reach?: boolean;
  /** Plays the bottom-up cedar fill once; the caller swaps to PUBLISHED when it ends. */
  filling?: boolean;
  className?: string;
}) {
  const dense = size !== "md";
  return (
    <svg
      viewBox="0 0 12 14"
      aria-hidden="true"
      focusable="false"
      className={cn("sm-stall", `sm-stall--${size}`, className)}
      data-reach={reach || undefined}
    >
      <g className="sm-stall-shape">
        <Shape status={status} shape="stall" filling={filling} />
      </g>
      {dense && (
        <g className="sm-booth" transform="translate(0 1.2) scale(1.2)">
          <Shape status={status} shape="booth" filling={filling} />
        </g>
      )}
    </svg>
  );
}
