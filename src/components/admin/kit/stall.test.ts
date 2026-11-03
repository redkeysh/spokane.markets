import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { glyphParts, SHAPE_VIEWBOX, type StallShape, type StallStatus } from "./stall-geometry";

type Ground = { name: string; ground: string; ink: Record<string, string> };

const LIGHT_INK: Record<string, string> = {
  cedar: "#1F4D3A",
  honey: "#D6A23A",
  "honey-ink": "#7E5410",
  ponderosa: "#9A3C22",
  ash: "#5A5466",
  "ash-quiet": "#655F71",
};
const DARK_INK: Record<string, string> = {
  cedar: "#7FC6A0",
  honey: "#E2B355",
  "honey-ink": "#E2B355",
  ponderosa: "#EE9A7E",
  ash: "#B0A9BC",
  "ash-quiet": "#A39CAE",
};

/** Sheet (lists) and fog (rail) in both modes. */
const GROUNDS: Ground[] = [
  { name: "light sheet", ground: "#FBFAFC", ink: LIGHT_INK },
  { name: "light fog", ground: "#F1EEF4", ink: LIGHT_INK },
  { name: "dark sheet", ground: "#24212A", ink: DARK_INK },
  { name: "dark fog", ground: "#1B1920", ink: DARK_INK },
];

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Rasterizes a glyph on a ground and returns, per pixel, how close it is to the ground color:
 * 0 is pure ink (the solid cedar of a published stall), 1 is pure ground.
 */
async function raster(status: StallStatus, shape: StallShape, cssWidth: number, dpr: number, ground: Ground) {
  const vb = SHAPE_VIEWBOX[shape];
  const width = cssWidth * dpr;
  const height = Math.round((cssWidth * vb.height * dpr) / vb.width);
  const paths = glyphParts(status, shape)
    .map(
      (p) =>
        `<path d="${p.d}" fill="${p.fill ? ground.ink[p.fill] : "none"}" stroke="${p.stroke ? ground.ink[p.stroke] : "none"}" stroke-width="${p.strokeWidth ?? 0}"${p.dash ? ` stroke-dasharray="${p.dash}"` : ""}/>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${vb.width} ${vb.height}"><rect x="-1" y="-1" width="${vb.width + 2}" height="${vb.height + 2}" fill="${ground.ground}"/>${paths}</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  const g = rgb(ground.ground);
  const k = rgb(ground.ink.cedar);
  const span = g.reduce((sum, v, i) => sum + (v - k[i]) ** 2, 0);
  return Array.from({ length: info.height }, (_, r) =>
    Array.from({ length: info.width }, (_, c) => {
      const at = (r * info.width + c) * info.channels;
      return g.reduce((sum, v, i) => sum + (data[at + i] - k[i]) * (v - k[i]), 0) / span;
    })
  );
}

/**
 * The scallop reads when the gaps between the three half circles show as notches: some row has
 * at least two interior runs of ground pixels, each at least 2 device pixels wide. A smeared
 * scallop leaves single-pixel specks over a flat band.
 */
function scallopResolves(rows: number[][]): boolean {
  return rows.some((row) => {
    const runs: { start: number; end: number }[] = [];
    let start = -1;
    row.forEach((value, c) => {
      if (value > 0.5 && start < 0) start = c;
      if ((value <= 0.5 || c === row.length - 1) && start >= 0) {
        runs.push({ start, end: value > 0.5 ? c : c - 1 });
        start = -1;
      }
    });
    const interior = runs.filter((r) => r.start > 0 && r.end < row.length - 1);
    return interior.length >= 2 && interior.every((r) => r.end - r.start + 1 >= 2);
  });
}

describe.each(GROUNDS)("stall pixel test on the $name", (ground) => {
  it("resolves the scallop at 12 px on 1x and 2x displays", async () => {
    expect(scallopResolves(await raster("PUBLISHED", "stall", 12, 1, ground))).toBe(true);
    expect(scallopResolves(await raster("PUBLISHED", "stall", 12, 2, ground))).toBe(true);
  });

  it("resolves the scallop at 10 px on a 2x display", async () => {
    expect(scallopResolves(await raster("PUBLISHED", "stall", 10, 2, ground))).toBe(true);
  });

  it("smears the scallop at 10 px on a 1x display, so dense glyphs fall back to booth squares", async () => {
    expect(scallopResolves(await raster("PUBLISHED", "stall", 10, 1, ground))).toBe(false);
  });
});

describe("glyphParts", () => {
  it("never relies on color alone: each waiting or ended status has its own shape", () => {
    const signature = (status: StallStatus) =>
      glyphParts(status, "stall")
        .map((p) => `${p.d}|${p.fill ?? ""}|${p.dash ?? ""}|${p.role}`)
        .join(";");
    const statuses: StallStatus[] = ["PUBLISHED", "PENDING", "DRAFT", "CANCELLED", "REJECTED", "ARCHIVED"];
    const shapes = statuses.map((s) => signature(s).replace(/cedar|honey-ink|honey|ponderosa|ash-quiet|ash/g, ""));
    expect(new Set(shapes).size).toBe(statuses.length);
  });

  it("draws Pending with a hatch and Draft dashed in both shapes", () => {
    for (const shape of ["stall", "booth"] as const) {
      expect(glyphParts("PENDING", shape).some((p) => p.role === "hatch")).toBe(true);
      expect(glyphParts("DRAFT", shape).every((p) => p.dash)).toBe(true);
    }
  });
});
