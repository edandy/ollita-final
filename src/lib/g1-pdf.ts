export const G1_SHEET_WIDTH = 794;
export const G1_SHEET_HEIGHT = 1123;
export const G1_NOS_LOGO_WIDTH = 90;
export const G1_NOS_LOGO_HEIGHT = 22;

export function g1ImageDisplaySize(img: {
  width: number;
  height: number;
  style: { width: string; height: string };
}) {
  const cssW = parseFloat(img.style.width);
  const cssH = parseFloat(img.style.height);
  return {
    width: Number.isFinite(cssW) && cssW > 0 ? Math.round(cssW) : G1_NOS_LOGO_WIDTH,
    height: Number.isFinite(cssH) && cssH > 0 ? Math.round(cssH) : G1_NOS_LOGO_HEIGHT,
  };
}

export const G1_PRINT_CSS = `
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.num { font-variant-numeric: tabular-nums; }
.g1-sheet { box-shadow: none !important; margin: 0 !important; }
.g1-nos-logo {
  display: block;
  width: 90px;
  height: 22px;
  flex-shrink: 0;
  overflow: hidden;
  line-height: 0;
}
.g1-nos-logo img,
.g1-nos-logo svg {
  width: 90px !important;
  height: 22px !important;
  max-width: 90px;
  max-height: 22px;
  display: block;
}
table.g1-tb {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  line-height: 17px;
  color: #111111;
}
table.g1-tb th {
  font-size: 12px;
  line-height: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #475569;
  text-align: left;
  padding: 0 8px 4px 0;
  border-bottom: 1.5px solid #072249;
  white-space: nowrap;
}
table.g1-tb td {
  padding: 3px 8px 2px 0;
  border-bottom: 1px solid #E0E0E0;
  vertical-align: middle;
}
table.g1-tb th:last-child,
table.g1-tb td:last-child { padding-right: 0; }
table.g1-tb .r {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
table.g1-tb.g3-tb td {
  padding: 4px 8px 3px 0;
}
table.g1-tb .c {
  text-align: center;
  font-variant-numeric: tabular-nums;
}
table.g1-tb td.al {
  background: #FDECEA;
  color: #C5221F;
  font-weight: 700;
}
table.g1-tb tr.tot td {
  font-weight: 700;
  border-bottom: 0;
  border-top: 1.5px solid #072249;
}
@media print {
  @page { size: A4; margin: 0; }
}
`;

function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function g1PdfFilename(groupName: string, weekFrom: string, weekTo: string) {
  return `G1-Raciones-${slugify(groupName)}-${weekFrom}_${weekTo}.pdf`;
}

export function g2PdfFilename(groupName: string, weekFrom: string, weekTo: string) {
  return `G2-Almacen-${slugify(groupName)}-${weekFrom}_${weekTo}.pdf`;
}

export function g3PdfFilename(groupName: string, monthFrom: string) {
  return `G3-Rendimiento-${slugify(groupName)}-${monthFrom.slice(0, 7)}.pdf`;
}

export function g4PdfFilename(groupName: string, mode: "month" | "year", start: string) {
  return `G4-Padron-${slugify(groupName)}-${start.slice(0, mode === "year" ? 4 : 7)}.pdf`;
}

function openPrintFrame() {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "Exportar reporte");
  Object.assign(iframe.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: `${G1_SHEET_WIDTH}px`,
    height: `${G1_SHEET_HEIGHT}px`,
    border: "0",
    opacity: "0",
    pointerEvents: "none",
    zIndex: "-1",
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("No se pudo preparar la hoja");
  }
  const origin = window.location.origin;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head>
    <meta charset="utf-8" />
    <style>
      @font-face { font-family: "Metropolis"; src: url("${origin}/fonts/Metropolis-Regular.woff") format("woff"); font-weight: 400; font-style: normal; }
      @font-face { font-family: "Metropolis"; src: url("${origin}/fonts/Metropolis-SemiBold.woff") format("woff"); font-weight: 600; font-style: normal; }
      @font-face { font-family: "Metropolis"; src: url("${origin}/fonts/Metropolis-Bold.woff") format("woff"); font-weight: 700; font-style: normal; }
      ${G1_PRINT_CSS}
    </style>
  </head><body></body></html>`);
  doc.close();
  return { iframe, doc };
}

async function inlineImages(root: HTMLElement) {
  const imgs = [...root.querySelectorAll("img")];
  await Promise.all(
    imgs.map(async (img) => {
      if (!img.src || img.src.startsWith("data:")) return;
      try {
        const res = await fetch(img.src);
        const text = await res.text();
        if (text.includes("<svg")) {
          const wrap = img.ownerDocument.createElement("span");
          wrap.setAttribute("style", img.getAttribute("style") ?? "");
          wrap.innerHTML = text;
          const svg = wrap.querySelector("svg");
          if (svg) {
            const size = g1ImageDisplaySize(img);
            svg.setAttribute("width", String(size.width));
            svg.setAttribute("height", String(size.height));
            svg.style.width = `${size.width}px`;
            svg.style.height = `${size.height}px`;
            svg.style.maxWidth = `${size.width}px`;
            svg.style.maxHeight = `${size.height}px`;
            svg.style.display = "block";
            const box = img.closest(".g1-nos-logo");
            if (box) {
              img.replaceWith(svg);
            } else {
              wrap.className = "g1-nos-logo";
              wrap.setAttribute(
                "style",
                `display:block;width:${size.width}px;height:${size.height}px;overflow:hidden;line-height:0;flex-shrink:0`,
              );
              img.replaceWith(wrap);
            }
            return;
          }
        }
        const blob = await fetch(img.src).then((r) => r.blob());
        img.src = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch {
        img.remove();
      }
    }),
  );
}

export function buildG1SheetSvg(sheetXhtml: string, css: string) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${G1_SHEET_WIDTH}" height="${G1_SHEET_HEIGHT}" viewBox="0 0 ${G1_SHEET_WIDTH} ${G1_SHEET_HEIGHT}">` +
    `<foreignObject x="0" y="0" width="${G1_SHEET_WIDTH}" height="${G1_SHEET_HEIGHT}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${G1_SHEET_WIDTH}px;height:${G1_SHEET_HEIGHT}px;background:#ffffff">` +
    `<style>${css}</style>${sheetXhtml}</div></foreignObject></svg>`
  );
}

const G1_FONT_FILES = [
  { weight: 400, file: "Metropolis-Regular.woff" },
  { weight: 600, file: "Metropolis-SemiBold.woff" },
  { weight: 700, file: "Metropolis-Bold.woff" },
];

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function embeddedFontCss() {
  const rules = await Promise.all(
    G1_FONT_FILES.map(async ({ weight, file }) => {
      const res = await fetch(`/fonts/${file}`);
      const url = await blobToDataUrl(await res.blob());
      return `@font-face{font-family:"Metropolis";font-weight:${weight};font-style:normal;src:url("${url}") format("woff");}`;
    }),
  );
  return rules.join("");
}

// The browser lays the sheet out itself (SVG foreignObject), so text sits exactly where
// the preview shows it; html2canvas drew text lower than borders and clipped chips.
async function rasterToPdf(sheet: HTMLElement, filename: string) {
  const { jsPDF } = await import("jspdf");
  const sheetXhtml = new XMLSerializer().serializeToString(sheet);
  const svg = buildG1SheetSvg(sheetXhtml, (await embeddedFontCss()) + G1_PRINT_CSS);
  const img = new Image();
  img.decoding = "sync";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("No se pudo dibujar la hoja"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = G1_SHEET_WIDTH * scale;
  canvas.height = G1_SHEET_HEIGHT * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la hoja");
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297);
  pdf.save(filename);
}

export async function downloadG1Pdf(sheet: HTMLElement, filename: string) {
  const { iframe, doc } = openPrintFrame();
  const clone = sheet.cloneNode(true) as HTMLElement;
  clone.style.transform = "none";
  clone.style.opacity = "1";
  clone.style.position = "static";
  await inlineImages(clone);
  doc.body.appendChild(clone);
  if (doc.fonts) {
    await Promise.all([
      doc.fonts.load("16px Metropolis"),
      doc.fonts.load("600 16px Metropolis"),
      doc.fonts.load("700 28px Metropolis"),
    ]).catch(() => undefined);
    await doc.fonts.ready.catch(() => undefined);
  }

  try {
    await rasterToPdf(clone, filename);
    iframe.remove();
  } catch (err) {
    console.error(err);
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      throw err;
    }
    win.addEventListener("afterprint", () => iframe.remove(), { once: true });
    iframe.style.opacity = "1";
    win.focus();
    win.print();
  }
}
