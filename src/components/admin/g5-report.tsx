import type { Ref } from "react";
import { formatG1Number, formatG1Percent } from "@/lib/g1";
import { formatG2Money } from "@/lib/g2";
import { G5_COVERAGE_ALERT, G5_HOURLY_VALUE, type G5Report } from "@/lib/g5";
import {
  ChipIcon,
  Kpi,
  Meta,
  MetaBand,
  ReportPreview,
  ReportSheet,
  SectionHead,
  SheetNote,
  displayName,
  joinNames,
} from "@/components/admin/report-sheet";

const ALERT = { fontWeight: 700, color: "#C5221F" } as const;

export function G5ReportPreview({
  report,
  sheetRef,
}: {
  report: G5Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return <ReportPreview sheetRef={sheetRef} renderSheet={(ref) => <G5ReportSheet report={report} ref={ref} />} />;
}

function RoleCard({ label, value, total }: { label: string; value: number; total?: boolean }) {
  return (
    <div
      style={{
        ...(total ? { background: "#F0F0F0" } : { border: "1px solid #E0E0E0" }),
        borderRadius: 10,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 12, lineHeight: "16px", color: "#475569" }}>{label}</span>
      <span className="num" style={{ fontSize: 16, lineHeight: "22px", fontWeight: 700, color: "#072249" }}>
        {formatG1Number(value)}
      </span>
    </div>
  );
}

function CoverageBar({ rate }: { rate: number }) {
  const low = rate < G5_COVERAGE_ALERT;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 8, background: "#E0E0E0" }}>
        <div
          style={{ width: `${Math.min(100, rate * 100)}%`, height: 8, background: low ? "#C5221F" : "#2656C9" }}
        />
      </div>
      <span className="num" style={{ width: 36, textAlign: "right", ...(low ? ALERT : {}) }}>
        {formatG1Percent(rate)}
      </span>
    </div>
  );
}

export function G5ReportSheet({ report, ref }: { report: G5Report; ref?: Ref<HTMLElement | null> }) {
  const { boards, roles, women } = report;
  const until = report.month.until;

  return (
    <ReportSheet
      code="G5"
      title="Equipo y turnos del grupo"
      cadence="Mensual"
      footerNote="Sin nombres de socias"
      sheetRef={ref}
    >
      <MetaBand columns="repeat(4, minmax(0, 1fr))">
        <Meta label="Grupo" value={`${report.groupName} (${report.coverage.total})`} />
        <Meta
          label="Período"
          value={until ? `${report.month.label} (al ${until.slice(8)}/${until.slice(5, 7)})` : report.month.label}
        />
        <Meta label="Con supervisora" value={`${report.supervised.count} de ${report.supervised.total}`} numeric />
        <Meta
          label="Cobertura del consolidado"
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
          label="Directivas completas"
          value={`${boards.complete} de ${boards.evaluated}`}
          hint={`${formatG1Percent(boards.evaluated ? boards.complete / boards.evaluated : 0)} de los comedores`}
        />
        <Kpi
          label="Cobertura de turnos"
          value={formatG1Percent(report.shiftCoverage)}
          hint="Días con turno asignado"
        />
        <Kpi
          label="Trabajo de las socias"
          value={`${formatG1Number(report.hours)} h`}
          hint={`≈ ${formatG2Money(report.workValue)} a valor hora`}
          dark
        />
        <Kpi
          label="Mujeres en cargos directivos"
          value={women.known ? formatG1Percent(women.rate) : "—"}
          hint={`${women.women} de ${women.known} cargos${women.unknown ? ` · ${women.unknown} sin dato` : ""}`}
        />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead title="Integrantes por cargo" chip="Solo supervisión" tone="muted" icon="visibility" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
          <RoleCard label="Presidentas" value={roles.presidentas} />
          <RoleCard label="Tesoreras" value={roles.tesoreras} />
          <RoleCard label="Almaceneras" value={roles.almaceneras} />
          <RoleCard label="Socias en turnos" value={roles.sociasEnTurnos} />
          <RoleCard label="Total" value={roles.total} total />
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead
          title="Directiva, turnos y horas por comedor"
          chip="Solo supervisión"
          tone="muted"
          icon="visibility"
        />
        <table className="g1-tb">
          <thead>
            <tr>
              <th>Comedor</th>
              <th>Directiva</th>
              <th style={{ width: 200, paddingLeft: 12 }}>Cobertura de turnos</th>
              <th className="r">Horas del mes</th>
            </tr>
          </thead>
          <tbody>
            {report.kitchens.map((k) =>
              k.hasData ? (
                <tr key={k.id}>
                  <td>{displayName(k.nombre)}</td>
                  <td style={k.missing.length ? ALERT : undefined}>
                    {k.missing.length ? `Falta ${joinNames(k.missing)}` : "Completa"}
                  </td>
                  <td style={{ paddingLeft: 12 }}>
                    <CoverageBar rate={k.coverage} />
                  </td>
                  <td className="r">{formatG1Number(k.hours)}</td>
                </tr>
              ) : (
                <tr key={k.id} style={{ color: "#475569" }}>
                  <td>{displayName(k.nombre)}</td>
                  <td>Sin datos</td>
                  <td style={{ paddingLeft: 12 }}>—</td>
                  <td className="r">—</td>
                </tr>
              ),
            )}
            <tr className="tot">
              <td>Grupo</td>
              <td>
                {boards.complete} de {boards.evaluated} completas
              </td>
              <td style={{ paddingLeft: 12 }}>
                <span className="num">{formatG1Percent(report.shiftCoverage)}</span>
              </td>
              <td className="r">{formatG1Number(report.hours)}</td>
            </tr>
          </tbody>
        </table>
        <SheetNote>
          En rojo: cargo sin registrar o cobertura de turnos menor al {Math.round(G5_COVERAGE_ALERT * 100)}%. Los
          turnos de cada socia se ven solo dentro de su comedor; no se comparan socias de distintos comedores.
        </SheetNote>
      </section>

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
        <span className="num" style={{ fontSize: 13, lineHeight: "18px" }}>
          <strong>Trabajo de las socias:</strong> {formatG1Number(report.hours)} horas × S/{" "}
          {G5_HOURLY_VALUE.toFixed(2)} por hora (parámetro) ≈ {formatG2Money(report.workValue)} en el mes.
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "1px 8px",
            border: "1px solid #2656C9",
            borderRadius: 9999,
            fontSize: 12,
            lineHeight: "16px",
            fontWeight: 600,
            color: "#2656C9",
            whiteSpace: "nowrap",
          }}
        >
          <ChipIcon name="groups" size={14} />
          Todos · solo el total
        </span>
      </div>
    </ReportSheet>
  );
}
