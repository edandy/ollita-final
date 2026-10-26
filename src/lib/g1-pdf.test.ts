import { describe, expect, it } from "vitest";
import {
  G1_NOS_LOGO_HEIGHT,
  G1_NOS_LOGO_WIDTH,
  G1_PRINT_CSS,
  G1_SHEET_HEIGHT,
  G1_SHEET_WIDTH,
  buildG1SheetSvg,
  g1ImageDisplaySize,
  g1PdfFilename,
} from "./g1-pdf";

describe("g1PdfFilename", () => {
  it("builds a download name from the group and week", () => {
    expect(g1PdfFilename("VES Sur Demo", "2026-10-26", "2026-10-31")).toBe(
      "G1-Raciones-VES-Sur-Demo-2026-10-26_2026-10-31.pdf",
    );
  });

  it("strips accents and punctuation from the group name", () => {
    expect(g1PdfFilename("Ollas María · Centro", "2026-01-05", "2026-01-10")).toBe(
      "G1-Raciones-Ollas-Maria-Centro-2026-01-05_2026-01-10.pdf",
    );
  });
});

describe("G1 sheet size", () => {
  it("matches the A4 mockup in CSS pixels", () => {
    expect(G1_SHEET_WIDTH).toBe(794);
    expect(G1_SHEET_HEIGHT).toBe(1123);
  });

  it("keeps the NOS logo at the mockup 90×22, not the SVG intrinsic size", () => {
    expect(G1_NOS_LOGO_WIDTH).toBe(90);
    expect(G1_NOS_LOGO_HEIGHT).toBe(22);
    expect(
      g1ImageDisplaySize({ width: 238, height: 58, style: { width: "90px", height: "22px" } }),
    ).toEqual({ width: 90, height: 22 });
    expect(g1ImageDisplaySize({ width: 238, height: 58, style: { width: "", height: "" } })).toEqual({
      width: 90,
      height: 22,
    });
  });
});

describe("G1_PRINT_CSS", () => {
  it("styles the isolated sheet with hex colors only", () => {
    expect(G1_PRINT_CSS).toContain("table.g1-tb");
    expect(G1_PRINT_CSS).toContain("#072249");
    expect(G1_PRINT_CSS).not.toContain("Material Symbols");
    expect(G1_PRINT_CSS.toLowerCase()).not.toContain("oklch");
  });
});

describe("buildG1SheetSvg", () => {
  it("wraps the sheet in a foreignObject at the A4 size with embedded css", () => {
    const svg = buildG1SheetSvg('<div xmlns="http://www.w3.org/1999/xhtml">x</div>', "a{color:#000}");
    expect(svg).toContain(`width="${G1_SHEET_WIDTH}"`);
    expect(svg).toContain(`height="${G1_SHEET_HEIGHT}"`);
    expect(svg).toContain("<foreignObject");
    expect(svg).toContain("<style>a{color:#000}</style>");
    expect(svg).toContain(">x</div>");
  });
});
