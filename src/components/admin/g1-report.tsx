import type { Ref } from "react";
import {
  formatG1Number,
  formatG1Percent,
  isLowOccupancy,
  type G1Report,
} from "@/lib/g1";
import {
  ChipIcon,
  Kpi,
  Meta,
  MetaBand,
  ReportPreview,
  ReportSheet,
  SectionHead,
  displayName,
  joinNames,
} from "@/components/admin/report-sheet";

export function G1ReportPreview({
  report,
  sheetRef,
}: {
  report: G1Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return <ReportPreview sheetRef={sheetRef} renderSheet={(ref) => <G1ReportSheet report={report} ref={ref} />} />;
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
    <ReportSheet code="G1" title="Raciones del grupo" sheetRef={ref}>
        <MetaBand columns="minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 0.6fr) minmax(0, 1.4fr)">
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
        </MetaBand>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
          <Kpi label="Raciones preparadas" value={formatG1Number(report.totals.prepared)} />
          <Kpi label="Raciones entregadas" value={formatG1Number(report.totals.delivered)} />
          <Kpi
            label="Ocupación del grupo"
            value={formatG1Percent(report.totals.occupancy)}
            hint={
              report.coverage.withData > 0
                ? `Rango: ${formatG1Percent(report.totals.occupancyMin)} a ${formatG1Percent(report.totals.occupancyMax)}`
                : undefined
            }
            dark
          />
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
    </ReportSheet>
  );
}
