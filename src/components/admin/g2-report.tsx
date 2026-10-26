import type { Ref } from "react";
import { formatG1Number } from "@/lib/g1";
import {
  G2_ALERT_DAYS,
  G2_CRITICAL_DAYS,
  G2_SHOPPING_DAYS,
  formatG2Days,
  formatG2Money,
  formatG2Quantity,
  isG2Alert,
  type G2KitchenRow,
  type G2Report,
} from "@/lib/g2";
import {
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

const MAX_SUPPLY_ROWS = 7;
const MAX_SHOPPING_CARDS = 5;

export function G2ReportPreview({
  report,
  sheetRef,
}: {
  report: G2Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return <ReportPreview sheetRef={sheetRef} renderSheet={(ref) => <G2ReportSheet report={report} ref={ref} />} />;
}

export function G2ReportSheet({ report, ref }: { report: G2Report; ref?: Ref<HTMLElement | null> }) {
  const withData = report.coverage.withData;
  const supplies = report.supplies.slice(0, MAX_SUPPLY_ROWS);
  const hiddenSupplies = report.supplies.length - supplies.length;
  const half = Math.ceil(report.kitchens.length / 2);
  const kitchenColumns = [report.kitchens.slice(0, half), report.kitchens.slice(half)].filter((c) => c.length > 0);
  const withoutData = report.kitchens.filter((k) => !k.hasData).map((k) => displayName(k.nombre));

  return (
    <ReportSheet code="G2" title="Almacén del grupo" sheetRef={ref}>
      <MetaBand columns="minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 1.3fr)">
        <Meta label="Grupo" value={`${report.groupName} (${report.coverage.total})`} />
        <Meta label="Corte de stock" value={report.cutoff.label} />
        <Meta label="Umbral de alerta" value={`Menos de ${G2_ALERT_DAYS} días`} />
        <Meta
          label="Cobertura del consolidado"
          value={report.coverage.total === 0 ? "Sin ollas" : `${withData} de ${report.coverage.total} con datos`}
          numeric
        />
      </MetaBand>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <Kpi label="Stock valorizado" value={formatG2Money(report.totals.stockValue)} />
        <Kpi label="Insumos en catálogo" value={formatG1Number(report.totals.catalogSize)} />
        <Kpi label="Comedores en alerta" value={`${report.totals.kitchensInAlert} de ${withData}`} dark />
        <Kpi
          label={`Con ${G2_CRITICAL_DAYS} días o menos`}
          value={`${report.totals.kitchensCritical} de ${withData}`}
          valueColor={report.totals.kitchensCritical > 0 ? "#C5221F" : undefined}
        />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead title="Stock y consumo por insumo" chip="Solo supervisión" tone="muted" icon="visibility" />
        <table className="g1-tb">
          <thead>
            <tr>
              <th>Insumo</th>
              <th className="r">Stock</th>
              <th className="r">Uso diario</th>
              <th className="r">En alerta</th>
              <th className="r">Se acaba antes del {report.nextCutoff.label}</th>
            </tr>
          </thead>
          <tbody>
            {supplies.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "#718096" }}>Sin movimientos de almacén esta semana.</td>
              </tr>
            ) : (
              supplies.map((s) => (
                <tr key={s.key}>
                  <td>{s.label}</td>
                  <td className="r">{formatG2Quantity(s.stock, s.unit)}</td>
                  <td className="r">{formatG2Quantity(s.dailyUse, s.unit)}</td>
                  <td className="r" style={s.inAlert > 0 ? { fontWeight: 700, color: "#C5221F" } : undefined}>
                    {s.inAlert}
                  </td>
                  <td className="r">{s.runsOutBeforeNext}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <SheetNote>
          La cobertura no se promedia entre comedores: se cuenta en cuántos alcanza para menos de {G2_ALERT_DAYS} días
          de atención.
          {hiddenSupplies > 0 &&
            ` Se muestran los ${supplies.length} insumos con más alertas de ${report.supplies.length}.`}
        </SheetNote>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead
          title="Días de cobertura por comedor · insumos básicos"
          chip="Solo supervisión"
          tone="muted"
          icon="visibility"
        />
        {report.basics.length === 0 ? (
          <SheetNote>Aún no hay salidas registradas para calcular los días de cobertura.</SheetNote>
        ) : (
          <>
            <div
              style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 28, alignItems: "start" }}
            >
              {kitchenColumns.map((column, i) => (
                <CoverageTable key={i} kitchens={column} basics={report.basics} />
              ))}
            </div>
            <SheetNote>
              Días de atención que alcanza el stock. Fondo rojo: menos de {G2_ALERT_DAYS} días.
              {withoutData.length > 0 &&
                ` ${joinNames(withoutData)} no ${withoutData.length === 1 ? "registró" : "registraron"} movimientos esta semana.`}
            </SheetNote>
          </>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead
          title={`Lista de compras consolidada · próximos ${G2_SHOPPING_DAYS} días`}
          chip="Solo supervisión"
          tone="muted"
          icon="visibility"
        />
        {report.shopping.length === 0 ? (
          <SheetNote>Ningún comedor necesita reponer para los próximos {G2_SHOPPING_DAYS} días.</SheetNote>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8 }}>
              {report.shopping.slice(0, MAX_SHOPPING_CARDS).map((s) => (
                <div
                  key={s.key}
                  style={{
                    border: "1px solid #E0E0E0",
                    borderRadius: 10,
                    padding: "8px 10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    minWidth: 0,
                  }}
                >
                  <span style={{ fontSize: 12, lineHeight: "16px", color: "#475569" }}>{s.label}</span>
                  <span className="num" style={{ fontSize: 16, lineHeight: "22px", fontWeight: 700, color: "#072249" }}>
                    {formatG2Quantity(s.quantity, s.unit)}
                  </span>
                  <span className="num" style={{ fontSize: 12, lineHeight: "16px", color: "#475569" }}>
                    {s.kitchens} comedor{s.kitchens === 1 ? "" : "es"}
                  </span>
                </div>
              ))}
            </div>
            <SheetNote>
              Suma de las listas de cada comedor. Antes de comprar, revisar Excedentes y faltantes (G10) y Compras
              conjuntas (G11).
            </SheetNote>
          </>
        )}
      </section>
    </ReportSheet>
  );
}

function CoverageTable({ kitchens, basics }: { kitchens: G2KitchenRow[]; basics: G2Report["basics"] }) {
  return (
    <table className="g1-tb">
      <thead>
        <tr>
          <th>Comedor</th>
          {basics.map((b) => (
            <th key={b.key} className="c" style={{ textTransform: "none", letterSpacing: 0 }}>
              {b.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {kitchens.map((k) => (
          <tr key={k.id} style={k.hasData ? undefined : { color: "#475569" }}>
            <td style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
              {displayName(k.nombre)}
            </td>
            {k.days.map((d, i) => (
              <td key={basics[i].key} className={isG2Alert(d) ? "c al" : "c"}>
                {formatG2Days(d)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
