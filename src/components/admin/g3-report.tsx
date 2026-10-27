import type { ReactNode, Ref } from "react";
import { formatG1Number, formatG1Percent } from "@/lib/g1";
import { formatG2Money } from "@/lib/g2";
import {
  G3_BASELINE_MONTHS,
  G3_REPEAT_RUN,
  formatG3Money,
  formatG3Percent,
  formatG3Yield,
  type G3Report,
} from "@/lib/g3";
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

function cents(n: number) {
  return formatG3Money(n).replace("S/ ", "");
}

export function G3ReportPreview({
  report,
  sheetRef,
}: {
  report: G3Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return <ReportPreview sheetRef={sheetRef} renderSheet={(ref) => <G3ReportSheet report={report} ref={ref} />} />;
}

export function G3ReportSheet({ report, ref }: { report: G3Report; ref?: Ref<HTMLElement | null> }) {
  const { cost, variety } = report;
  const half = Math.ceil(report.kitchenCosts.length / 2);
  const left = report.kitchenCosts.slice(0, half);
  const right = report.kitchenCosts.slice(half);
  // Rows flow left-right, so interleave the two halves to read top-down per column.
  const bars = left.flatMap((k, i) => (right[i] ? [k, right[i]] : [k]));
  const scale = cost.max > 0 ? cost.max : 1;
  const groupAt = Math.min(100, (cost.perServing / scale) * 100);
  const repeated = variety.repeatedKitchens;

  return (
    <ReportSheet code="G3" title="Rendimiento de insumos del grupo" cadence="Mensual" sheetRef={ref}>
      <MetaBand columns="repeat(4, minmax(0, 1fr))">
        <Meta label="Grupo" value={`${report.groupName} (${report.coverage.total})`} />
        <Meta
          label="Período"
          value={
            report.month.until
              ? `${report.month.label} (al ${report.month.until.slice(8)}/${report.month.until.slice(5, 7)})`
              : report.month.label
          }
        />
        <Meta label="Raciones preparadas" value={formatG1Number(report.prepared)} numeric />
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
          label="Costo de alimentos por ración"
          value={formatG3Money(cost.perServing)}
          hint={report.coverage.withData > 0 ? `Rango: S/ ${cents(cost.min)} a ${cents(cost.max)}` : undefined}
          dark
        />
        <Kpi
          label="Merma frente a la receta"
          value={report.merma == null ? "—" : formatG3Percent(report.merma)}
          hint={report.merma == null ? "Sin historial previo" : "Insumo usado de más"}
        />
        <Kpi
          label="Raciones no entregadas"
          value={formatG1Number(report.unserved.servings)}
          hint={`${formatG3Percent(report.unserved.rate)} · ≈ ${formatG2Money(report.unserved.cost)} en insumos`}
        />
        <Kpi
          label="Platos distintos por comedor"
          value={report.dishes.average.toFixed(1)}
          hint={`Promedio · rango ${report.dishes.min} a ${report.dishes.max}`}
        />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead
          title="Rendimiento por insumo, con rango entre comedores"
          chip="Solo supervisión"
          tone="muted"
          icon="visibility"
        />
        <table className="g1-tb g3-tb">
          <thead>
            <tr>
              <th>Insumo</th>
              <th className="r">Grupo</th>
              <th className="r">Mínimo</th>
              <th className="r">Máximo</th>
              <th style={{ paddingLeft: 20 }}>Más alto en</th>
            </tr>
          </thead>
          <tbody>
            {report.yields.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "#718096" }}>Sin salidas de almacén este mes.</td>
              </tr>
            ) : (
              report.yields.map((y) => (
                <tr key={y.key}>
                  <td>{y.label}</td>
                  <td className="r" style={{ fontWeight: 700 }}>{formatG3Yield(y.group, y.unit)}</td>
                  <td className="r">{formatG3Yield(y.min, y.unit)}</td>
                  <td className="r" style={y.high ? { fontWeight: 700, color: "#C5221F" } : undefined}>
                    {formatG3Yield(y.max, y.unit)}
                  </td>
                  <td style={{ paddingLeft: 20 }}>{displayName(y.maxKitchen)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <SheetNote>
          Grupo = Σ kg de salida ÷ Σ raciones preparadas. En rojo, máximos un 50% o más por encima del grupo.
        </SheetNote>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead
          title="Costo de alimentos por ración, por comedor"
          chip="Solo supervisión"
          tone="muted"
          icon="visibility"
        />
        {bars.length === 0 ? (
          <SheetNote>Sin datos de costo este mes.</SheetNote>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gridAutoFlow: "row",
                gap: "6px 28px",
                fontSize: 13,
                lineHeight: "18px",
              }}
            >
              {bars.map((k) => (
                <div
                  key={k.id}
                  style={{ display: "grid", gridTemplateColumns: "140px minmax(0, 1fr) 50px", gap: 8, alignItems: "center" }}
                >
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {displayName(k.nombre)}
                  </span>
                  <div style={{ height: 10, background: "#E0E0E0", position: "relative" }}>
                    <div
                      style={{
                        width: `${Math.min(100, (k.cost / scale) * 100)}%`,
                        height: 10,
                        background: k.cost > cost.perServing ? "#072249" : "#2656C9",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        left: `${groupAt}%`,
                        top: -3,
                        width: 2,
                        height: 16,
                        background: "#C5221F",
                      }}
                    />
                  </div>
                  <span className="num" style={{ textAlign: "right" }}>{formatG3Money(k.cost)}</span>
                </div>
              ))}
            </div>
            <SheetNote>
              Línea roja: costo del grupo ({formatG3Money(cost.perServing)}). Azul oscuro: comedores por encima del
              grupo. Ordenado de mayor a menor, por columnas.
            </SheetNote>
          </>
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead title="Variedad del menú" chip="Solo supervisión" tone="muted" icon="visibility" />
        {variety.leastVaried == null ? (
          <SheetNote>Sin menús publicados este mes.</SheetNote>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr)", gap: 28 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, lineHeight: "18px" }}>
                <span>
                  <Figure>{formatG1Percent(variety.proteinRate)}</Figure> de los días con proteína animal
                </span>
                <span>
                  <Figure>{variety.leastVaried.dishes}</Figure> plato{variety.leastVaried.dishes === 1 ? "" : "s"}{" "}
                  distinto{variety.leastVaried.dishes === 1 ? "" : "s"} en el comedor con menos variedad (
                  {displayName(variety.leastVaried.nombre)})
                </span>
                <span>
                  <Figure>{repeated}</Figure> {repeated === 1 ? "comedor repitió" : "comedores repitieron"} un plato{" "}
                  {G3_REPEAT_RUN} días seguidos
                </span>
              </div>
              <table className="g1-tb g3-tb">
                <thead>
                  <tr>
                    <th>Más repetidos en el grupo</th>
                    <th className="r">% días</th>
                  </tr>
                </thead>
                <tbody>
                  {variety.topDishes.map((d) => (
                    <tr key={d.label}>
                      <td>{d.label}</td>
                      <td className="r">{Math.round(d.rate * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SheetNote>
              Proteína animal estimada según el nombre del plato. La merma compara el consumo por ración de cada
              comedor con su promedio de los {G3_BASELINE_MONTHS} meses anteriores.
            </SheetNote>
          </>
        )}
      </section>
    </ReportSheet>
  );
}

function Figure({ children }: { children: ReactNode }) {
  return (
    <strong className="num" style={{ fontSize: 18, color: "#072249" }}>
      {children}
    </strong>
  );
}
