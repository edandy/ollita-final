import type { Ref } from "react";
import { formatG1Number, formatG1Percent } from "@/lib/g1";
import { G4_PHONE_ALERT, G4_SMALL_COUNT, formatG4Count, type G4Report } from "@/lib/g4";
import {
  Kpi,
  Meta,
  MetaBand,
  ReportPreview,
  ReportSheet,
  SectionHead,
  SheetNote,
  displayName,
} from "@/components/admin/report-sheet";

const DETAIL_STYLE = { fontSize: 12, color: "#475569" } as const;

export function G4ReportPreview({
  report,
  sheetRef,
}: {
  report: G4Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return <ReportPreview sheetRef={sheetRef} renderSheet={(ref) => <G4ReportSheet report={report} ref={ref} />} />;
}

function periodLabel(period: G4Report["period"]) {
  if (!period.until) return period.label;
  return `${period.label} (al ${period.until.slice(8)}/${period.until.slice(5, 7)})`;
}

function share(people: number, total: number) {
  if (people > 0 && people < G4_SMALL_COUNT) return "—";
  return total ? String(Math.round((people / total) * 100)) : "0";
}

function rangeText(c: { rate: number; min: number; max: number }, prefix = "") {
  return `${formatG1Percent(c.rate)} (${prefix}${formatG1Percent(c.min)} a ${formatG1Percent(c.max)})`;
}

function duplicatesText(d: G4Report["duplicates"]) {
  const split =
    d.inThreeOrMore === 0
      ? d.people === 1
        ? "está en dos padrones"
        : "todas están en dos padrones"
      : `${formatG1Number(d.inTwo)} ${d.inTwo === 1 ? "está" : "están"} en dos padrones y ${formatG1Number(d.inThreeOrMore)} en ${d.maxKitchens === 3 ? "tres" : "tres o más"}`;
  const top = d.pairs.slice(0, 2);
  const rest = d.pairs.slice(2);
  const named = top.map((p) => `${displayName(p.names[0])} y ${displayName(p.names[1])} (${p.people})`).join(", ");
  const others = rest.length
    ? `; ${rest.length === 1 ? "otro par" : `otros ${rest.length} pares`} (${rest.reduce((s, p) => s + p.people, 0)})`
    : "";
  return `${split}. Más casos: ${named}${others}.`;
}

export function G4ReportSheet({ report, ref }: { report: G4Report; ref?: Ref<HTMLElement | null> }) {
  const { completeness, duplicates } = report;
  const total = report.activePeople;

  return (
    <ReportSheet
      code="G4"
      title="Padrón del grupo"
      cadence="Mensual y anual"
      footerNote="Sin nombres ni DNI"
      gap={10}
      sheetRef={ref}
    >
      <MetaBand columns="repeat(4, minmax(0, 1fr))">
        <Meta label="Grupo" value={`${report.groupName} (${report.coverage.total})`} />
        <Meta label="Período" value={periodLabel(report.period)} />
        <Meta label="Altas · bajas" value={`${formatG1Number(report.newEntries)} · sin fecha`} numeric />
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
          label="Personas activas"
          value={formatG1Number(total)}
          // A no-break space keeps the thousands together if the hint wraps.
          hint={`Suma de padrones: ${formatG1Number(report.activeRows).replace(/ /g, "\u00a0")}`}
          dark
        />
        <Kpi label="Personas cubiertas" value={formatG1Number(report.coveredPeople)} hint="Con sus familias" />
        <Kpi label="Carga familiar promedio" value={report.averageLoad.toFixed(1)} />
        <Kpi
          label="Uso del padrón"
          value={formatG1Percent(report.usage)}
          hint={`${formatG1Number(report.servedPeople)} recibieron ración`}
        />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead
          title="Personas activas por categoría y subtipo"
          chip={`Todos · umbral de ${G4_SMALL_COUNT}`}
          tone="accent"
          icon="groups"
        />
        <table className="g1-tb">
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Subtipo</th>
              <th className="r">Personas</th>
              <th className="r">%</th>
            </tr>
          </thead>
          <tbody>
            {report.categories.map((c) => (
              <tr key={c.key}>
                <td>{c.label}</td>
                <td style={DETAIL_STYLE}>
                  {c.parts ? c.parts.map((p) => `${p.label}: ${formatG4Count(p.count)}`).join(" · ") : "—"}
                </td>
                <td className="r">{formatG4Count(c.people)}</td>
                <td className="r">{share(c.people, total)}</td>
              </tr>
            ))}
            <tr className="tot">
              <td>Total</td>
              <td />
              <td className="r">{formatG1Number(total)}</td>
              <td className="r">{total ? "100" : "0"}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead title="Vigencias y uso por comedor" chip="Solo supervisión" tone="muted" icon="visibility" />
        <table className="g1-tb">
          <thead>
            <tr>
              <th>Comedor</th>
              <th className="r">Inactivos de hecho</th>
              <th className="r">Con teléfono</th>
            </tr>
          </thead>
          <tbody>
            {report.kitchens.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ color: "#718096" }}>Sin personas activas en los padrones del grupo.</td>
              </tr>
            ) : (
              report.kitchens.map((k) => (
                <tr key={k.id}>
                  <td>{displayName(k.nombre)}</td>
                  <td className="r">{formatG1Number(k.inactive)}</td>
                  <td
                    className="r"
                    style={k.phoneRate < G4_PHONE_ALERT ? { fontWeight: 700, color: "#C5221F" } : undefined}
                  >
                    {formatG1Percent(k.phoneRate)}
                  </td>
                </tr>
              ))
            )}
            <tr className="tot">
              <td>Grupo</td>
              <td className="r">{formatG1Number(report.groupInactive)}</td>
              <td className="r">{formatG1Percent(report.groupPhoneRate)}</td>
            </tr>
          </tbody>
        </table>
        <SheetNote>
          Completitud del grupo: teléfono {rangeText(completeness.phone, "rango ")}, dirección {rangeText(completeness.address)},
          foto {rangeText(completeness.photo)}.
        </SheetNote>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead
          title="Personas en más de un padrón"
          chip="Municipalidad y supervisión · sin nombres"
          tone="muted"
          icon="visibility"
        />
        <div style={{ padding: "8px 12px", background: "#F0F0F0", borderRadius: 8, fontSize: 13, lineHeight: "18px" }}>
          {duplicates.people === 0 ? (
            "Nadie está en más de un padrón del grupo."
          ) : (
            <>
              <strong className="num">
                {formatG1Number(duplicates.people)} {duplicates.people === 1 ? "persona" : "personas"}
              </strong>
              : {duplicatesText(duplicates)} La lista con nombres solo la ven los comedores involucrados.
            </>
          )}
        </div>
      </section>
    </ReportSheet>
  );
}
