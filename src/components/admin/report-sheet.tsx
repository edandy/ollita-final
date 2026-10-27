import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import logoNos from "@/assets/logo-nos.svg";
import { G1_NOS_LOGO_HEIGHT, G1_NOS_LOGO_WIDTH, sheetSize, type SheetOrientation } from "@/lib/g1-pdf";
import { todayISO } from "@/lib/dates";

export function displayName(nombre: string) {
  return nombre.replace(/^Demo · /, "");
}

export function joinNames(names: string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function generatedLabel() {
  const [y, m, d] = todayISO().split("-");
  return `${d}/${m}/${y}`;
}

export function ChipIcon({ name, size }: { name: "visibility" | "groups"; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden
    >
      {name === "visibility" ? (
        <>
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <circle cx="12" cy="8" r="2.5" />
          <circle cx="4.5" cy="10" r="1.8" />
          <circle cx="19.5" cy="10" r="1.8" />
          <path d="M7.5 19v-1.5a4.5 4.5 0 0 1 9 0V19" />
          <path d="M1.5 17.5v-.5a3 3 0 0 1 3-3M22.5 17.5v-.5a3 3 0 0 0-3-3" />
        </>
      )}
    </svg>
  );
}

/** Scales the A4 sheet to fit on screen and keeps an unscaled copy for the PDF export. */
export function ReportPreview({
  renderSheet,
  sheetRef,
  orientation = "portrait",
}: {
  renderSheet: (ref?: Ref<HTMLElement | null>) => ReactNode;
  sheetRef?: Ref<HTMLElement | null>;
  orientation?: SheetOrientation;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const size = sheetSize(orientation);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setScale(Math.min(1, host.clientWidth / size.width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [size.width]);

  return (
    <>
      <div ref={hostRef} className="g1-screen-preview w-full">
        <div style={{ height: size.height * scale }}>
          <div className="origin-top-left" style={{ transform: `scale(${scale})` }}>
            {renderSheet()}
          </div>
        </div>
      </div>
      <div className="g1-print-root" aria-hidden="true">
        {renderSheet(sheetRef)}
      </div>
    </>
  );
}

export function ReportSheet({
  code,
  title,
  cadence = "Semanal",
  footerNote = "Consolidado sin datos de caja",
  chip = "Versión supervisión",
  orientation = "portrait",
  gap = 12,
  sheetRef,
  children,
}: {
  code: string;
  title: string;
  cadence?: "Semanal" | "Mensual" | "Mensual y anual";
  footerNote?: string;
  chip?: string;
  orientation?: SheetOrientation;
  gap?: number;
  sheetRef?: Ref<HTMLElement | null>;
  children: ReactNode;
}) {
  const size = sheetSize(orientation);
  // The landscape mockup fits brand, title, chip and logo in one header row.
  const compact = orientation === "landscape";

  const pill = (
    <span
      style={{
        ...(compact ? { alignSelf: "flex-start" } : {}),
        padding: "2px 10px",
        background: "#2656C9",
        borderRadius: 9999,
        fontSize: 12,
        lineHeight: "16px",
        fontWeight: 700,
        color: "#FFFFFF",
        whiteSpace: "nowrap",
      }}
    >
      Consolidado de grupo
    </span>
  );
  const brand = (
    <span
      style={{
        fontSize: compact ? 22 : 26,
        lineHeight: compact ? "26px" : "32px",
        fontWeight: 400,
        color: "#072249",
      }}
    >
      La Ollita
    </span>
  );
  const logo = (
    <span className="g1-nos-logo">
      <img
        src={logoNos}
        alt="NOS Finance"
        width={G1_NOS_LOGO_WIDTH}
        height={G1_NOS_LOGO_HEIGHT}
        style={{ width: G1_NOS_LOGO_WIDTH, height: G1_NOS_LOGO_HEIGHT, display: "block", objectFit: "contain" }}
      />
    </span>
  );
  const heading = (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 2 : 4 }}>
      <span
        style={{
          fontSize: 12,
          lineHeight: "16px",
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#2656C9",
        }}
      >
        Reporte {code} · {cadence} · Grupo de ollas
      </span>
      <h1
        style={{
          margin: 0,
          fontSize: compact ? 26 : 28,
          lineHeight: compact ? "32px" : "34px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "#072249",
          fontFamily: "Metropolis, 'Proxima Nova', sans-serif",
        }}
      >
        {title}
      </h1>
    </div>
  );
  const chipEl = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 12px",
        border: "1px solid #475569",
        borderRadius: 9999,
        fontSize: 12,
        lineHeight: "16px",
        fontWeight: 600,
        color: "#475569",
        whiteSpace: "nowrap",
      }}
    >
      <ChipIcon name="visibility" size={16} />
      {chip}
    </span>
  );
  const rule = {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 24,
    paddingBottom: 10,
    borderBottom: "2px solid #072249",
  } as const;

  return (
    <article
      ref={sheetRef}
      className="g1-sheet"
      data-orientation={orientation}
      style={{
        width: size.width,
        height: size.height,
        minHeight: size.height,
        boxSizing: "border-box",
        background: "#FFFFFF",
        fontFamily: "Metropolis, 'Proxima Nova', 'Helvetica Neue', Arial, sans-serif",
        color: "#111111",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        margin: "0 auto",
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      <div style={{ height: 8, background: "#2656C9", flexShrink: 0 }} />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap,
          padding: "32px 48px 0 48px",
        }}
      >
        {compact ? (
          <div style={rule}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 28 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {brand}
                {pill}
              </div>
              {heading}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {chipEl}
              {logo}
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {brand}
                {pill}
              </div>
              {logo}
            </div>
            <div style={rule}>
              {heading}
              {chipEl}
            </div>
          </>
        )}

        {children}
      </div>

      <footer style={{ padding: `${compact ? 8 : 10}px 48px 40px 48px`, flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            paddingTop: compact ? 8 : 10,
            borderTop: "1px solid #E0E0E0",
            fontSize: 12,
            lineHeight: "16px",
            color: "#475569",
          }}
        >
          <span>La Ollita · NOS Finance · Generado el {generatedLabel()}</span>
          <span>{footerNote}</span>
          <span>Página 1 de 1</span>
        </div>
      </footer>
    </article>
  );
}

export function MetaBand({
  columns,
  padding = "10px 16px",
  children,
}: {
  columns: string;
  padding?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: columns,
        gap: 16,
        padding,
        background: "#D4E7FF",
        borderRadius: 12,
      }}
    >
      {children}
    </div>
  );
}

export function Meta({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 12, lineHeight: "16px", color: "#475569" }}>{label}</span>
      <span
        className={numeric ? "num" : undefined}
        style={{ fontSize: 14, lineHeight: "20px", fontWeight: 600, color: "#072249" }}
      >
        {value}
      </span>
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  dark,
  valueColor,
}: {
  label: string;
  value: string;
  hint?: string;
  dark?: boolean;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        ...(dark ? { background: "#072249" } : { border: "1px solid #E0E0E0" }),
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 12, lineHeight: "16px", color: dark ? "#D4E7FF" : "#475569" }}>{label}</span>
      <span
        className="num"
        style={{ fontSize: 20, lineHeight: "26px", fontWeight: 700, color: valueColor ?? (dark ? "#FFFFFF" : "#072249") }}
      >
        {value}
      </span>
      {hint && (
        <span className="num" style={{ fontSize: 12, lineHeight: "16px", color: dark ? "#D4E7FF" : "#475569" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function SectionHead({
  title,
  chip,
  tone,
  icon,
}: {
  title: string;
  chip: string;
  tone: "muted" | "accent";
  icon: "visibility" | "groups";
}) {
  const color = tone === "accent" ? "#2656C9" : "#475569";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <h2
        style={{
          margin: 0,
          fontSize: 15,
          lineHeight: "20px",
          fontWeight: 700,
          color: "#072249",
          fontFamily: "Metropolis, 'Proxima Nova', sans-serif",
        }}
      >
        {title}
      </h2>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "1px 8px",
          border: `1px solid ${color}`,
          borderRadius: 9999,
          fontSize: 12,
          lineHeight: "16px",
          fontWeight: 600,
          color,
          whiteSpace: "nowrap",
        }}
      >
        <ChipIcon name={icon} size={14} />
        {chip}
      </span>
    </div>
  );
}

export function SheetNote({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 12, lineHeight: "16px", color: "#475569" }}>{children}</span>;
}
