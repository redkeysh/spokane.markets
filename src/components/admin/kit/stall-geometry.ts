/**
 * Geometry of the stall, the admin's only custom mark: a scalloped awning over a box.
 * Pure data, shared by the React glyph and the pixel test.
 */

export type StallStatus =
  | "PUBLISHED"
  | "PENDING"
  | "DRAFT"
  | "CANCELLED"
  | "REJECTED"
  | "ARCHIVED"
  /** Slim rail summary for a week with nothing listed. */
  | "EMPTY";

/** "stall" is the 12 x 14 booth; "booth" is the 10 x 10 square set used where the scallop cannot resolve. */
export type StallShape = "stall" | "booth";

export type StallColor = "cedar" | "honey" | "honey-ink" | "ponderosa" | "ash" | "ash-quiet";

/** `role` drives the forced-colors overrides in globals.css. */
export type StallPart = {
  d: string;
  fill?: StallColor;
  stroke?: StallColor;
  strokeWidth?: number;
  dash?: string;
  role: "solid" | "wait-fill" | "line" | "hatch";
};

export const SHAPE_VIEWBOX: Record<StallShape, { width: number; height: number }> = {
  stall: { width: 12, height: 14 },
  booth: { width: 10, height: 10 },
};

const DASH = "2 1.5";

/** Rect 0,0 12x4 plus three half circles of radius 2 hanging from y=4 at cx 2, 6 and 10. */
export const AWNING_FILL = "M0 0H12V4A2 2 0 0 1 8 4A2 2 0 0 1 4 4A2 2 0 0 1 0 4Z";
/** The awning outline inset by half its 1 px stroke, so the stroke stays inside the fill shape. */
export const AWNING_LINE =
  "M0.5 0.5H11.5V4A1.5 1.5 0 0 1 8.5 4H7.5A1.5 1.5 0 0 1 4.5 4H3.5A1.5 1.5 0 0 1 0.5 4Z";
/** Rect x=0.75 y=6.75 w=10.5 h=6.5, drawn with a 1.5 stroke. */
export const BOX = "M0.75 6.75H11.25V13.25H0.75Z";
export const HATCH = "M2.5 13L6 7.5M6 13L9.5 7.5";
const SLASH = "M0.75 13.25L11.25 0.75";
const CROSS = "M2.5 3.5L9.5 10.5M9.5 3.5L2.5 10.5";

const SQUARE_FILL = "M0 0H10V10H0Z";
const SQUARE_LINE = "M0.75 0.75H9.25V9.25H0.75Z";
const SQUARE_HATCH = "M1.75 5.75L5.75 1.75M4.25 8.25L8.25 4.25";
const SQUARE_SLASH = "M0.75 9.25L9.25 0.75";
const SQUARE_CROSS = "M2 2L8 8M8 2L2 8";
const CIRCLE = "M5 0.75A4.25 4.25 0 1 1 5 9.25A4.25 4.25 0 1 1 5 0.75Z";

function outline(d: string, color: StallColor, strokeWidth: number, dash?: string): StallPart {
  return { d, stroke: color, strokeWidth, dash, role: "line" };
}

function stallParts(status: StallStatus): StallPart[] {
  switch (status) {
    case "PUBLISHED":
      return [
        { d: AWNING_FILL, fill: "cedar", role: "solid" },
        { d: BOX, fill: "cedar", stroke: "cedar", strokeWidth: 1.5, role: "solid" },
      ];
    case "PENDING":
      return [
        { d: AWNING_FILL, fill: "honey", role: "wait-fill" },
        outline(AWNING_LINE, "honey-ink", 1),
        outline(BOX, "honey-ink", 1.5),
        { d: HATCH, stroke: "honey-ink", strokeWidth: 1, role: "hatch" },
      ];
    case "DRAFT":
      return [outline(AWNING_LINE, "honey-ink", 1, DASH), outline(BOX, "honey-ink", 1.5, DASH)];
    case "CANCELLED":
      return [
        outline(AWNING_LINE, "ponderosa", 1),
        outline(BOX, "ponderosa", 1.5),
        outline(SLASH, "ponderosa", 1.5),
      ];
    case "REJECTED":
      return [outline(CROSS, "ponderosa", 1.5)];
    case "ARCHIVED":
      return [outline(AWNING_LINE, "ash-quiet", 1), outline(BOX, "ash-quiet", 1.5)];
    case "EMPTY":
      return [outline(AWNING_LINE, "ash", 1), outline(BOX, "ash", 1.5)];
  }
}

function boothParts(status: StallStatus): StallPart[] {
  switch (status) {
    case "PUBLISHED":
      return [{ d: SQUARE_FILL, fill: "cedar", role: "solid" }];
    case "PENDING":
      return [
        outline(SQUARE_LINE, "honey-ink", 1.5),
        { d: SQUARE_HATCH, stroke: "honey-ink", strokeWidth: 1, role: "hatch" },
      ];
    case "DRAFT":
      return [outline(SQUARE_LINE, "honey-ink", 1.5, DASH)];
    case "CANCELLED":
      return [outline(SQUARE_LINE, "ponderosa", 1.5), outline(SQUARE_SLASH, "ponderosa", 1.5)];
    case "REJECTED":
      return [outline(SQUARE_CROSS, "ponderosa", 1.5)];
    case "ARCHIVED":
      return [outline(CIRCLE, "ash-quiet", 1.5)];
    case "EMPTY":
      return [outline(SQUARE_LINE, "ash", 1.5)];
  }
}

export function glyphParts(status: StallStatus, shape: StallShape): StallPart[] {
  return shape === "stall" ? stallParts(status) : boothParts(status);
}

/**
 * A waiting glyph that is being published: the awning turns cedar at once and a cedar copy of the
 * box is returned separately, for the bottom-up clip-path fill.
 */
export function fillingParts(
  status: StallStatus,
  shape: StallShape
): { base: StallPart[]; fill: StallPart[] } {
  if (shape === "booth") {
    return { base: boothParts(status), fill: [{ d: SQUARE_FILL, fill: "cedar", role: "solid" }] };
  }
  const base = stallParts(status).filter((p) => p.d !== AWNING_FILL && p.d !== AWNING_LINE);
  return {
    base: [{ d: AWNING_FILL, fill: "cedar", role: "solid" }, ...base],
    fill: [{ d: BOX, fill: "cedar", stroke: "cedar", strokeWidth: 1.5, role: "solid" }],
  };
}
