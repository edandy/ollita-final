import { useEffect, useRef, useState, type Ref } from "react";
import logoNos from "@/assets/logo-nos.svg";
import {
  formatG1Number,
  formatG1Percent,
  isLowOccupancy,
  type G1Report,
} from "@/lib/g1";
import { G1_NOS_LOGO_HEIGHT, G1_NOS_LOGO_WIDTH, G1_SHEET_HEIGHT, G1_SHEET_WIDTH } from "@/lib/g1-pdf";
import { todayISO } from "@/lib/dates";

function displayName(nombre: string) {
  return nombre.replace(/^Demo · /, "");
}

function joinNames(names: string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function generatedLabel() {
  const [y, m, d] = todayISO().split("-");
  return `${d}/${m}/${y}`;
}

function ChipIcon({ name, size }: { name: "visibility" | "groups"; size: number }) {
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

export function G1ReportPreview({
  report,
  sheetRef,
}: {
  report: G1Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => setScale(Math.min(1, host.clientWidth / G1_SHEET_WIDTH));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <div ref={hostRef} className="g1-screen-preview w-full">
        <div style={{ height: G1_SHEET_HEIGHT * scale }}>
          <div className="origin-top-left" style={{ transform: `scale(${scale})` }}>
            <G1ReportSheet report={report} />
          </div>
        </div>
      </div>
      <div className="g1-print-root" aria-hidden="true">
        <G1ReportSheet report={report} ref={sheetRef} />
      </div>
    </>
  );
}

export function G1ReportSheet({ report, ref }: { report: G1Report; ref?: Ref<HTMLElement | null> }) {
  const delivered = report.totals.delivered;
  const padronPct = delivered > 0 ? Math.round((report.channels.padron / delivered) * 100) : 0;
  const librePct = delivered > 0 ? Math.round((report.channels.libre / delivered) * 100) : 0;
  const padronTotal = report.channels.padron;
  const overlap = Math.max(0, report.uniquePeople.sumKitchens - report.uniquePeople.group);
  const withData = report.kitchens.filter((k) => k.hasData).length;
  const leaders = report.leftoverLeaders.map((l) => displayName(l.nombre));

  return (
    <article
      ref={ref}
      className="g1-sheet"
      style={{
        width: G1_SHEET_WIDTH,
        height: G1_SHEET_HEIGHT,
        minHeight: G1_SHEET_HEIGHT,
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
          gap: 12,
          padding: "32px 48px 0 48px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 26,
                lineHeight: "32px",
                fontWeight: 400,
                color: "#072249",
              }}
            >
              La Ollita
            </span>
            <span
              style={{
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
          </div>
          <span className="g1-nos-logo">
            <img
              src={logoNos}
              alt="NOS Finance"
              width={G1_NOS_LOGO_WIDTH}
              height={G1_NOS_LOGO_HEIGHT}
              style={{ width: G1_NOS_LOGO_WIDTH, height: G1_NOS_LOGO_HEIGHT, display: "block", objectFit: "contain" }}
            />
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 24,
            paddingBottom: 10,
            borderBottom: "2px solid #072249",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
              Reporte G1 · Semanal · Grupo de ollas
            </span>
            <h1
              style={{
                margin: 0,
                fontSize: 28,
                lineHeight: "34px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#072249",
                fontFamily: "Metropolis, 'Proxima Nova', sans-serif",
              }}
            >
              Raciones del grupo
            </h1>
          </div>
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
            Versión supervisión
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 0.6fr) minmax(0, 1.4fr)",
            gap: 16,
            padding: "10px 16px",
            background: "#D4E7FF",
            borderRadius: 12,
          }}
        >
          <Meta label="Grupo" value={report.groupName} />
          <Meta label="Semana" value={report.week.label} />
          <Meta label="Comedores" value={formatG1Number(report.coverage.total)} numeric />
          <Meta
            label="Cobertura del consolidado"
            value={
              report.coverage.total === 0
                ? "Sin ollas"
                : `${report.coverage.withData} de ${report.coverage.total} con datos completos`
            }
            numeric
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <Kpi label="Raciones preparadas" value={formatG1Number(report.totals.prepared)} />
          <Kpi label="Raciones entregadas" value={formatG1Number(report.totals.delivered)} />
          <div
            style={{
              background: "#072249",
              borderRadius: 12,
              padding: "10px 12px",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 12, lineHeight: "16px", color: "#D4E7FF" }}>Ocupación del grupo</span>
            <span className="num" style={{ fontSize: 20, lineHeight: "26px", fontWeight: 700, color: "#FFFFFF" }}>
              {formatG1Percent(report.totals.occupancy)}
            </span>
            {report.coverage.withData > 0 && (
              <span className="num" style={{ fontSize: 12, lineHeight: "16px", color: "#D4E7FF" }}>
                Rango: {formatG1Percent(report.totals.occupancyMin)} a {formatG1Percent(report.totals.occupancyMax)}
              </span>
            )}
          </div>
          <Kpi
            label="Personas atendidas"
            value={`~${formatG1Number(report.uniquePeople.group)}`}
            hint="Personas distintas"
          />
        </div>

        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SectionHead title="Raciones por comedor" chip="Solo supervisión" tone="muted" icon="visibility" />
          <table className="g1-tb">
            <thead>
              <tr>
                <th>Comedor</th>
                <th className="r">Preparadas</th>
                <th className="r">Entregadas</th>
                <th style={{ width: 210, paddingLeft: 20 }}>Ocupación</th>
                <th className="r">Sobrantes</th>
              </tr>
            </thead>
            <tbody>
              {report.kitchens.map((k) => (
                <tr key={k.id} style={k.hasData ? undefined : { color: "#475569" }}>
                  <td>{displayName(k.nombre)}</td>
                  {k.hasData ? (
                    <>
                      <td className="r">{formatG1Number(k.prepared)}</td>
                      <td className="r">{formatG1Number(k.delivered)}</td>
                      <td style={{ paddingLeft: 20 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 8, background: "#E0E0E0" }}>
                            <div
                              style={{
                                width: `${Math.min(100, Math.round(k.occupancy * 100))}%`,
                                height: 8,
                                background: isLowOccupancy(k.occupancy) ? "#C5221F" : "#2656C9",
                              }}
                            />
                          </div>
                          <span
                            className="num"
                            style={{
                              width: 34,
                              textAlign: "right",
                              fontWeight: isLowOccupancy(k.occupancy) ? 700 : undefined,
                              color: isLowOccupancy(k.occupancy) ? "#C5221F" : undefined,
                            }}
                          >
                            {formatG1Percent(k.occupancy)}
                          </span>
                        </div>
                      </td>
                      <td className="r">{formatG1Number(k.leftover)}</td>
                    </>
                  ) : (
                    <>
                      <td className="r">—</td>
                      <td className="r">—</td>
                      <td style={{ paddingLeft: 20 }}>Sin datos esta semana</td>
                      <td className="r">—</td>
                    </>
                  )}
                </tr>
              ))}
              <tr className="tot">
                <td>
                  Grupo ({withData} comedor{withData === 1 ? "" : "es"})
                </td>
                <td className="r">{formatG1Number(report.totals.prepared)}</td>
                <td className="r">{formatG1Number(report.totals.delivered)}</td>
                <td style={{ paddingLeft: 20 }}>
                  <span className="num">{formatG1Percent(report.totals.occupancy)}</span>
                </td>
                <td className="r">{formatG1Number(report.totals.leftover)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 32 }}>
          <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionHead title="Por canal" chip="Todos" tone="accent" icon="groups" />
            <div style={{ display: "flex", height: 10, gap: 2, margin: "2px 0" }}>
              <div style={{ width: `${padronPct}%`, background: "#072249" }} />
              <div style={{ flex: 1, background: "#009EF9" }} />
            </div>
            <table className="g1-tb">
              <thead>
                <tr>
                  <th>Canal</th>
                  <th className="r">Raciones</th>
                  <th className="r">%</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span style={{ display: "inline-block", width: 9, height: 9, background: "#072249", marginRight: 6 }} />
                    Padrón
                  </td>
                  <td className="r">{formatG1Number(report.channels.padron)}</td>
                  <td className="r">{padronPct}</td>
                </tr>
                <tr>
                  <td>
                    <span style={{ display: "inline-block", width: 9, height: 9, background: "#009EF9", marginRight: 6 }} />
                    Entregas libres
                  </td>
                  <td className="r">{formatG1Number(report.channels.libre)}</td>
                  <td className="r">{librePct}</td>
                </tr>
              </tbody>
            </table>
            {overlap > 0 && (
              <div
                style={{
                  marginTop: 4,
                  padding: "8px 12px",
                  background: "#F0F0F0",
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: "16px",
                }}
              >
                <strong>Personas distintas:</strong> sumando cada comedor salen {formatG1Number(report.uniquePeople.sumKitchens)};
                {" "}en el grupo son {formatG1Number(report.uniquePeople.group)}, porque {formatG1Number(overlap)}{" "}
                {overlap === 1 ? "persona recoge" : "personas recogen"} en más de un comedor.
              </div>
            )}
          </section>

          <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <SectionHead title="Padrón por categoría" chip="Todos" tone="accent" icon="groups" />
            <table className="g1-tb">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th className="r">Raciones</th>
                  <th className="r">%</th>
                </tr>
              </thead>
              <tbody>
                {report.categories.length === 0 ? (
                  <tr>
                    <td colSpan={3} style={{ color: "#718096" }}>Sin entregas de padrón esta semana.</td>
                  </tr>
                ) : (
                  report.categories.map((c) => (
                    <tr key={c.key}>
                      <td>{c.label}</td>
                      <td className="r">{formatG1Number(c.servings)}</td>
                      <td className="r">{padronTotal > 0 ? Math.round((c.servings / padronTotal) * 100) : 0}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "8px 14px",
            border: "1px solid #E0E0E0",
            borderRadius: 12,
          }}
        >
          <span style={{ fontSize: 13, lineHeight: "18px" }}>
            {report.totals.leftover > 0 ? (
              <>
                <strong>Comida no servida:</strong>{" "}
                <span className="num">
                  {formatG1Number(report.totals.leftover)} raciones ≈ {formatG1Number(report.leftoverKg)} kg
                </span>{" "}
                en el grupo.
                {leaders.length > 0
                  ? ` ${joinNames(leaders)} suman el ${
                      Math.round(
                        (report.leftoverLeaders.reduce((s, l) => s + l.leftover, 0) / report.totals.leftover) * 100,
                      )
                    }%.`
                  : ""}
              </>
            ) : (
              "No hubo raciones sin servir esta semana."
            )}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "1px 8px",
              border: "1px solid #475569",
              borderRadius: 9999,
              fontSize: 12,
              lineHeight: "16px",
              fontWeight: 600,
              color: "#475569",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <ChipIcon name="visibility" size={14} />
            Solo supervisión
          </span>
        </div>
      </div>

      <footer style={{ padding: "10px 48px 40px 48px", flexShrink: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            paddingTop: 10,
            borderTop: "1px solid #E0E0E0",
            fontSize: 12,
            lineHeight: "16px",
            color: "#475569",
          }}
        >
          <span>La Ollita · NOS Finance · Generado el {generatedLabel()}</span>
          <span>Consolidado sin datos de caja</span>
          <span>Página 1 de 1</span>
        </div>
      </footer>
    </article>
  );
}

function Meta({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
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

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        border: "1px solid #E0E0E0",
        borderRadius: 12,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 12, lineHeight: "16px", color: "#475569" }}>{label}</span>
      <span className="num" style={{ fontSize: 20, lineHeight: "26px", fontWeight: 700, color: "#072249" }}>
        {value}
      </span>
      {hint && <span style={{ fontSize: 12, lineHeight: "16px", color: "#475569" }}>{hint}</span>}
    </div>
  );
}

function SectionHead({
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
