import type { CSSProperties, Ref } from "react";
import { formatG1Number, formatG1Percent } from "@/lib/g1";
import type { G9Report } from "@/lib/g9";
import { Kpi, Meta, MetaBand, ReportPreview, ReportSheet, displayName } from "@/components/admin/report-sheet";

const H2: CSSProperties = { margin: 0, fontSize: 15, lineHeight: "20px", fontWeight: 700, color: "#072249" };
const MUTED: CSSProperties = { fontSize: 12, lineHeight: "16px", color: "#475569" };
const ALERT: CSSProperties = { fontWeight: 700, color: "#C5221F" };
const TH: CSSProperties = { whiteSpace: "normal", textTransform: "none", letterSpacing: 0, verticalAlign: "bottom" };
// Every kitchen of the group is 75 px tall, as in the mockup (14 of 15 = 70 px).
const BAR_MAX = 75;

export function G9ReportPreview({
  report,
  sheetRef,
}: {
  report: G9Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return <ReportPreview sheetRef={sheetRef} renderSheet={(ref) => <G9ReportSheet report={report} ref={ref} />} />;
}

function ddmm(iso: string | null) {
  if (!iso) return "—";
  return `${iso.slice(8)}/${iso.slice(5, 7)}`;
}

function delta(n: number) {
  if (n === 0) return "sin cambio";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function Issue({ value, noData }: { value: number; noData: boolean }) {
  if (noData) return <td className="r">—</td>;
  return (
    <td className="r" style={value ? ALERT : undefined}>
      {formatG1Number(value)}
    </td>
  );
}

export function G9ReportSheet({ report, ref }: { report: G9Report; ref?: Ref<HTMLElement | null> }) {
  const total = report.coverage.total;
  const weeks = report.weeks;

  return (
    <ReportSheet code="G9" title="Adopción y calidad de datos" footerNote="Uso de supervisión y NOS" sheetRef={ref}>
      <MetaBand columns="repeat(4, minmax(0, 1fr))">
        <Meta label="Grupo" value={`${report.groupName} (${total})`} />
        <Meta label="Semana" value={report.week.label} />
        <Meta label="Grupo desde" value={report.groupSince} numeric />
        <Meta
          label="Cobertura del consolidado"
          value={total === 0 ? "Sin ollas" : `${report.coverage.withData} de ${total} con datos`}
          numeric
        />
      </MetaBand>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <Kpi
          label="Comedores activos"
          value={`${report.activeKitchens.days7} de ${total}`}
          hint={`7 días · en 30: ${report.activeKitchens.days30}`}
          dark
        />
        <Kpi
          label="Usuarias activas"
          value={formatG1Number(report.users.current)}
          hint={`7 días · ${delta(report.users.delta)}`}
        />
        <Kpi label="Raciones gestionadas" value={formatG1Number(report.servings)} hint="En la semana" />
        <Kpi label="Personas en padrones" value={formatG1Number(report.people)} hint="Personas únicas" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 32 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={H2}>Comedores activos por semana</h2>
          <div
            role="img"
            aria-label={`Comedores activos por semana: ${weeks.map((w) => w.active).join(", ")} de ${total}`}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
              gap: 6,
              alignItems: "end",
              height: 92,
              borderBottom: "1px solid #111111",
            }}
          >
            {weeks.map((w, i) => {
              const last = i === weeks.length - 1;
              return (
                <div
                  key={w.label}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3 }}
                >
                  <span
                    className="num"
                    style={{ fontSize: 12, lineHeight: "14px", color: last ? "#072249" : "#475569", fontWeight: last ? 700 : 400 }}
                  >
                    {w.active}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      height: total ? Math.round((w.active / total) * BAR_MAX) : 0,
                      background: last ? "#072249" : "#2656C9",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`,
              gap: 6,
              ...MUTED,
              textAlign: "center",
              whiteSpace: "nowrap",
            }}
          >
            {weeks.map((w, i) => (
              <span key={w.label} style={i === weeks.length - 1 ? { fontWeight: 700, color: "#072249" } : undefined}>
                {w.label}
              </span>
            ))}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={H2}>Adopción por módulo · {report.month.label}</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "70px minmax(0, 1fr) 80px",
              gap: 8,
              alignItems: "center",
              fontSize: 13,
              lineHeight: "18px",
            }}
          >
            {report.modules.map((m) => {
              const rate = total ? m.kitchens / total : 0;
              return (
                <ModuleRow key={m.key} label={m.label} rate={rate} text={`${m.kitchens} (${formatG1Percent(rate)})`} />
              );
            })}
          </div>
          <span style={MUTED}>Comedores del grupo que usaron cada módulo en el mes.</span>
        </section>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Calidad de datos por comedor</h2>
        <table className="g1-tb" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={TH}>Comedor</th>
              <th className="r" style={TH}>Usuarias activas</th>
              <th className="r" style={TH}>Último registro</th>
              <th className="r" style={TH}>Cajas sin cuadrar</th>
              <th className="r" style={TH}>Entregas sin ingreso</th>
              <th className="r" style={TH}>Duplicados</th>
              <th className="r" style={TH}>Entregas pendientes</th>
              <th className="r" style={TH}>Datos completos</th>
            </tr>
          </thead>
          <tbody>
            {report.kitchens.map((k) => (
              <tr key={k.id}>
                <td style={{ whiteSpace: "nowrap" }}>{displayName(k.nombre)}</td>
                <td className="r" style={k.users === 0 ? ALERT : undefined}>
                  {formatG1Number(k.users)}
                </td>
                <td className="r" style={k.stale ? ALERT : undefined}>
                  {ddmm(k.lastRecord)}
                </td>
                <Issue value={k.unbalanced} noData={!k.hasData} />
                <Issue value={k.unpaid} noData={!k.hasData} />
                <Issue value={k.duplicates} noData={!k.hasData} />
                <Issue value={k.pending} noData={!k.hasData} />
                <td className="r" style={k.complete ? undefined : ALERT}>
                  {k.complete ? "Sí" : "No"}
                </td>
              </tr>
            ))}
            <tr className="tot">
              <td>Grupo</td>
              <td className="r">{formatG1Number(report.totals.users)}</td>
              <td className="r" />
              <td className="r">{formatG1Number(report.totals.unbalanced)}</td>
              <td className="r">{formatG1Number(report.totals.unpaid)}</td>
              <td className="r">{formatG1Number(report.totals.duplicates)}</td>
              <td className="r">{formatG1Number(report.totals.pending)}</td>
              <td className="r">
                {report.totals.complete} de {total}
              </td>
            </tr>
          </tbody>
        </table>
        <span style={MUTED}>
          Entregas sin ingreso: raciones cobradas sin venta en caja. Duplicados: mismo nombre en dos registros activos del
          mismo comedor. Entregas pendientes: registradas sin confirmar.
        </span>
      </section>
    </ReportSheet>
  );
}

function ModuleRow({ label, rate, text }: { label: string; rate: number; text: string }) {
  return (
    <>
      <span>{label}</span>
      <div style={{ height: 10, background: "#E0E0E0" }}>
        <div style={{ width: `${Math.min(100, rate * 100)}%`, height: 10, background: "#2656C9" }} />
      </div>
      <span className="num" style={{ textAlign: "right" }}>
        {text}
      </span>
    </>
  );
}
