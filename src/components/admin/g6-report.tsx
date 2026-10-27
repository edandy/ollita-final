import type { CSSProperties, ReactNode, Ref } from "react";
import { formatG1Number } from "@/lib/g1";
import { G6_ATTEND_AT, type G6Counts, type G6Report, type G6Status } from "@/lib/g6";
import { Meta, MetaBand, ReportPreview, ReportSheet, displayName } from "@/components/admin/report-sheet";

const STATUS: Record<G6Status, { label: string; dot: CSSProperties }> = {
  attend: { label: "Atender", dot: { background: "#C5221F" } },
  review: { label: "Revisar", dot: { background: "#F2A100" } },
  ok: { label: "Al día", dot: { background: "#34A853" } },
  noData: { label: "Sin datos", dot: { boxShadow: "inset 0 0 0 1.5px #475569" } },
};

const COLUMNS: { key: keyof G6Counts; label: string }[] = [
  { key: "noMenu", label: "Días sin menú" },
  { key: "openCash", label: "Cajas sin cerrar" },
  { key: "supplyAlerts", label: "Insumos en alerta" },
  { key: "expired", label: "Padrón vencido" },
  { key: "pending", label: "Registros pendientes" },
];

const TH: CSSProperties = { verticalAlign: "bottom", whiteSpace: "normal" };
const ACTION: CSSProperties = {
  paddingLeft: 24,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

export function G6ReportPreview({
  report,
  sheetRef,
}: {
  report: G6Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return (
    <ReportPreview
      orientation="landscape"
      sheetRef={sheetRef}
      renderSheet={(ref) => <G6ReportSheet report={report} ref={ref} />}
    />
  );
}

function Dot({ status, legend }: { status: G6Status; legend?: boolean }) {
  return (
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: 9999,
        flexShrink: 0,
        ...(legend ? { marginTop: 3 } : {}),
        ...STATUS[status].dot,
      }}
    />
  );
}

function Legend({ status, children }: { status: G6Status; children: ReactNode }) {
  return (
    <span style={{ display: "flex", gap: 6, alignItems: "flex-start", whiteSpace: "nowrap" }}>
      <Dot status={status} legend />
      <span>
        <strong style={{ color: "#111111" }}>{STATUS[status].label}</strong>: {children}
      </span>
    </span>
  );
}

function countStyle(status: G6Status, value: number): CSSProperties | undefined {
  if (!value) return undefined;
  return status === "attend" ? { fontWeight: 700, color: "#C5221F" } : { fontWeight: 700 };
}

export function G6ReportSheet({ report, ref }: { report: G6Report; ref?: Ref<HTMLElement | null> }) {
  const { counts } = report;
  const semaphore: [G6Status, number, string][] = [
    ["attend", counts.attend, "atender"],
    ["review", counts.review, "revisar"],
    ["ok", counts.ok, "al día"],
    ["noData", counts.noData, "sin datos"],
  ];

  return (
    <ReportSheet
      code="G6"
      title="Alertas del grupo"
      chip="Solo supervisión"
      footerNote="Uso de supervisión: no se comparte con aliados"
      orientation="landscape"
      gap={10}
      sheetRef={ref}
    >
      <MetaBand columns="minmax(0, 0.8fr) minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 2.2fr)" padding="8px 16px">
        <Meta label="Grupo" value={`${report.groupName} (${report.coverage.total})`} />
        <Meta label="Semana" value={report.week.label} />
        <Meta
          label="Cobertura"
          value={
            report.coverage.total === 0
              ? "Sin ollas"
              : `${report.coverage.withData} de ${report.coverage.total} con datos`
          }
          numeric
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 12, lineHeight: "16px", color: "#475569" }}>Semáforo</span>
          <span
            style={{
              display: "flex",
              gap: 14,
              fontSize: 14,
              lineHeight: "20px",
              fontWeight: 600,
              color: "#072249",
              whiteSpace: "nowrap",
            }}
          >
            {semaphore.map(([status, n, label]) => (
              <span key={status} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Dot status={status} />
                {n} {label}
              </span>
            ))}
          </span>
        </div>
      </MetaBand>

      <table className="g1-tb" style={{ tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={TH}>Estado</th>
            <th style={TH}>Comedor</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="r" style={TH}>
                {c.label}
              </th>
            ))}
            <th style={{ ...TH, paddingLeft: 24 }}>Qué atender primero</th>
          </tr>
        </thead>
        <tbody>
          {report.kitchens.length === 0 ? (
            <tr>
              <td colSpan={8} style={{ color: "#718096" }}>
                Sin comedores en el grupo.
              </td>
            </tr>
          ) : (
            report.kitchens.map((k) => {
              const noData = k.status === "noData";
              return (
                <tr key={k.id} style={noData ? { color: "#475569" } : undefined}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}>
                      <Dot status={k.status} />
                      {STATUS[k.status].label}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    {displayName(k.nombre)}
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="r" style={noData ? undefined : countStyle(k.status, k[c.key])}>
                      {noData ? "—" : formatG1Number(k[c.key])}
                    </td>
                  ))}
                  <td style={k.action ? ACTION : { paddingLeft: 24, color: "#475569" }}>{k.action ?? "—"}</td>
                </tr>
              );
            })
          )}
          <tr className="tot">
            <td />
            <td>Grupo</td>
            {COLUMNS.map((c) => (
              <td key={c.key} className="r">
                {formatG1Number(report.totals[c.key])}
              </td>
            ))}
            <td style={ACTION}>{report.totalsAction}</td>
          </tr>
        </tbody>
      </table>

      <div
        style={{
          display: "flex",
          gap: 14,
          fontSize: 12,
          lineHeight: "16px",
          color: "#475569",
          marginTop: "auto",
        }}
      >
        <Legend status="attend">{G6_ATTEND_AT} o más días sin menú, cajas sin cerrar o insumos en alerta.</Legend>
        <Legend status="review">cualquier otra alerta.</Legend>
        <Legend status="ok">todo en cero.</Legend>
        <span style={{ whiteSpace: "nowrap" }}>Registros pendientes: entregas sin confirmar.</span>
      </div>
    </ReportSheet>
  );
}
