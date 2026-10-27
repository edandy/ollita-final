import type { CSSProperties, Ref } from "react";
import { formatG1Number } from "@/lib/g1";
import type { G10Report } from "@/lib/g10";
import { Kpi, Meta, MetaBand, ReportPreview, ReportSheet, joinNames } from "@/components/admin/report-sheet";

const H2: CSSProperties = { margin: 0, fontSize: 15, lineHeight: "20px", fontWeight: 700, color: "#072249" };
const TOP: CSSProperties = { verticalAlign: "top" };
const RED = "#C5221F";

export function G10ReportPreview({
  report,
  sheetRef,
}: {
  report: G10Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return <ReportPreview sheetRef={sheetRef} renderSheet={(ref) => <G10ReportSheet report={report} ref={ref} />} />;
}

function ddmm(iso: string) {
  return `${iso.slice(8)}/${iso.slice(5, 7)}`;
}

function amount(quantity: number, unit: string) {
  return `${formatG1Number(quantity)} ${unit}`;
}

function kitchensWithDays(list: { id: string; nombre: string; days: number }[]) {
  return list.length ? list.map((k) => `${k.nombre} (${k.days})`).join(" · ") : "—";
}

function WarningIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth={2} strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
      <path d="M12 3.5 2.5 20h19z" />
      <path d="M12 10v4.5M12 17.2h.01" strokeLinecap="round" />
    </svg>
  );
}

function Signature({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 28 }}>
      <div style={{ height: 1, background: muted ? "#475569" : "#111111" }} />
      <span style={{ fontSize: 12, lineHeight: "16px", color: "#475569" }}>{label}</span>
    </div>
  );
}

export function G10ReportSheet({ report, ref }: { report: G10Report; ref?: Ref<HTMLElement | null> }) {
  const { counts } = report;

  return (
    <ReportSheet
      code="G10"
      title="Excedentes y faltantes"
      audience="Solo en grupo"
      chip="Solo supervisión"
      footerNote="Uso de supervisión: no se comparte con aliados"
      sheetRef={ref}
    >
      <MetaBand columns="minmax(0, 0.8fr) minmax(0, 0.9fr) minmax(0, 1.4fr) minmax(0, 1fr)">
        <Meta label="Grupo" value={`${report.groupName} (${report.coverage.total})`} />
        <Meta label="Corte de stock" value={report.cutoff.label} />
        <Meta
          label="Umbrales: falta · sobra"
          value={`< ${report.thresholds.short} días · > ${report.thresholds.surplus} días`}
        />
        <Meta
          label="Cobertura"
          value={
            report.coverage.total === 0
              ? "Sin ollas"
              : `${report.coverage.withData} de ${report.coverage.total} con datos`
          }
          numeric
        />
      </MetaBand>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <Kpi
          label="Con faltantes"
          value={formatG1Number(counts.shortKitchens)}
          hint={`En ${counts.shortSupplies} ${counts.shortSupplies === 1 ? "insumo básico" : "insumos básicos"}`}
          valueColor={counts.shortKitchens ? RED : undefined}
        />
        <Kpi label="Con excedentes" value={formatG1Number(counts.surplusKitchens)} hint="Pueden prestar" />
        <Kpi
          label="Sugeridas"
          value={formatG1Number(counts.suggested)}
          hint={`Cubren ${counts.covered} de ${counts.shortages} faltantes`}
          dark
        />
        <Kpi
          label="Semana anterior"
          value={formatG1Number(report.previous.length)}
          hint={`${report.previousReceived} ${report.previousReceived === 1 ? "recibida" : "recibidas"}`}
        />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Quién tiene de menos y quién de más</h2>
        <table className="g1-tb g3-tb">
          <thead>
            <tr>
              <th style={{ width: 70 }}>Insumo</th>
              <th style={{ width: 290 }}>Faltante · días de cobertura</th>
              <th>Excedente · días de cobertura</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: "#718096" }}>
                  Ninguna olla tiene menos de {report.thresholds.short} días de stock.
                </td>
              </tr>
            ) : (
              report.rows.map((r) => (
                <tr key={r.key}>
                  <td style={{ ...TOP, fontWeight: 600 }}>{r.label}</td>
                  <td style={{ ...TOP, color: RED }}>{kitchensWithDays(r.short)}</td>
                  <td style={TOP}>{kitchensWithDays(r.surplus)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Transferencias sugeridas</h2>
        <table className="g1-tb g3-tb">
          <thead>
            <tr>
              <th>Insumo</th>
              <th>De</th>
              <th>A</th>
              <th className="r">Cantidad</th>
              <th style={{ paddingLeft: 16 }}>Cobertura de quien recibe</th>
              <th style={{ width: 60, textAlign: "center" }}>Hecho</th>
            </tr>
          </thead>
          <tbody>
            {report.suggestions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "#718096" }}>
                  No hay excedentes para prestar a quien le falta.
                </td>
              </tr>
            ) : (
              report.suggestions.map((s, i) => (
                <tr key={`${s.key}-${s.fromId}-${s.toId}-${i}`}>
                  <td style={TOP}>{s.label}</td>
                  <td style={TOP}>{s.from}</td>
                  <td style={{ ...TOP, fontWeight: 600 }}>{s.to}</td>
                  <td className="r" style={TOP}>
                    {amount(s.quantity, s.unit)}
                  </td>
                  <td style={{ ...TOP, paddingLeft: 16 }}>
                    de {s.daysBefore} a {s.daysAfter} días
                  </td>
                  <td style={{ ...TOP, textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        width: 13,
                        height: 13,
                        border: "1.5px solid #072249",
                        borderRadius: 3,
                      }}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {report.warnings.map((w) => (
          <div
            key={w.label}
            style={{
              display: "flex",
              gap: 10,
              padding: "8px 12px",
              background: "#FDECEA",
              borderRadius: 8,
              fontSize: 13,
              lineHeight: "18px",
            }}
          >
            <WarningIcon />
            <span>
              <strong>{w.label}:</strong> el grupo entero tiene para unas {formatG1Number(w.servings)} raciones (≈{" "}
              {w.groupDays} {w.groupDays === 1 ? "día" : "días"}). Prestar no alcanza para {joinNames(w.uncovered)}: hay
              que comprar (ver Compras conjuntas, G11).
            </span>
          </div>
        ))}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Transferencias de la semana anterior</h2>
        <table className="g1-tb g3-tb">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Insumo</th>
              <th>De</th>
              <th>A</th>
              <th className="r">Cantidad</th>
              <th style={{ paddingLeft: 16 }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {report.previous.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ color: "#718096" }}>
                  No hubo préstamos entre ollas la semana anterior.
                </td>
              </tr>
            ) : (
              report.previous.map((t, i) => (
                <tr key={`${t.date}-${i}`}>
                  <td className="num" style={TOP}>
                    {ddmm(t.date)}
                  </td>
                  <td style={TOP}>{t.label}</td>
                  <td style={TOP}>{t.from}</td>
                  <td style={TOP}>{t.to}</td>
                  <td className="r" style={TOP}>
                    {amount(t.quantity, t.unit)}
                  </td>
                  <td style={{ ...TOP, paddingLeft: 16, ...(t.received ? {} : { fontWeight: 700, color: RED }) }}>
                    {t.received ? "Recibido" : "Por confirmar"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)",
          gap: 32,
          marginTop: "auto",
          alignItems: "end",
        }}
      >
        <Signature label="Observaciones" muted />
        <Signature label="Coordinadora del grupo" />
        <Signature label="Supervisora" />
      </div>
    </ReportSheet>
  );
}
