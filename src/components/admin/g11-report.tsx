import type { CSSProperties, Ref } from "react";
import { formatG1Number } from "@/lib/g1";
import type { G11Report } from "@/lib/g11";
import {
  Kpi,
  Meta,
  MetaBand,
  ReportPreview,
  ReportSheet,
  SectionHead,
  SheetNote,
  SignatureLine,
} from "@/components/admin/report-sheet";

const RED = "#C5221F";
const NUM: CSSProperties = { textAlign: "right" };

export function G11ReportPreview({
  report,
  sheetRef,
}: {
  report: G11Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return <ReportPreview sheetRef={sheetRef} renderSheet={(ref) => <G11ReportSheet report={report} ref={ref} />} />;
}

function money(n: number, decimals = 2) {
  const [whole, cents] = n.toFixed(decimals).split(".");
  return `S/ ${formatG1Number(Number(whole))}${cents ? `.${cents}` : ""}`;
}

function percentSigned(diff: number) {
  const n = Math.round(diff * 100);
  if (n === 0) return "0%";
  return n > 0 ? `+${n}%` : `−${Math.abs(n)}%`;
}

function unitsText(units: G11Report["units"]) {
  const parts = [
    units.kg ? `${formatG1Number(units.kg)} kg` : null,
    units.L ? `${formatG1Number(units.L)} L` : null,
    units.unid ? `${formatG1Number(units.unid)} unid` : null,
  ].filter(Boolean) as string[];
  if (parts.length <= 1) return parts[0] ?? "Nada que comprar";
  return `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
}

export function G11ReportSheet({ report, ref }: { report: G11Report; ref?: Ref<HTMLElement | null> }) {
  const { main } = report;

  return (
    <ReportSheet
      code="G11"
      title="Compras conjuntas"
      cadence="Mensual"
      audience="Solo en grupo"
      footerNote="No muestra montos de caja de los comedores"
      sheetRef={ref}
    >
      <MetaBand columns="repeat(4, minmax(0, 1fr))">
        <Meta label="Grupo" value={`${report.groupName} (${report.coverage.total})`} />
        <Meta label="Compra para" value={report.month.label} />
        <Meta
          label="Comedores que participan"
          value={`${report.participants.count} de ${report.participants.total}`}
          numeric
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
          label="Ahorro estimado"
          value={money(report.savings.total, 0)}
          hint={`${(report.savings.share * 100).toFixed(1)}% del precio actual`}
          dark
        />
        <Kpi label="Insumos en la compra" value={formatG1Number(report.items.length)} hint={unitsText(report.units)} />
        <Kpi
          label={main ? `${main.label}: precio del grupo` : "Precio del grupo"}
          value={main ? money(main.groupPrice) : "—"}
          hint={
            main
              ? main.negotiated != null
                ? `Negociado: ${money(main.negotiated)} por ${main.unit}`
                : "Sin precio negociado"
              : "Sin precios de compra"
          }
        />
        <Kpi
          label="Pagan más que el grupo"
          value={`${report.above.count} de ${report.above.total}`}
          hint={main ? `Por el ${main.unit === "L" ? "litro" : main.unit === "kg" ? "kilo" : "unidad"} de ${main.label.toLowerCase()}` : ""}
          valueColor={report.above.count ? RED : undefined}
        />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <SectionHead title="Lista de compras consolidada y ahorro" chip="Todos" tone="accent" icon="groups" />
        <table className="g1-tb g3-tb">
          <thead>
            <tr>
              <th>Insumo</th>
              <th className="r">Cantidad</th>
              <th className="r">Precio actual</th>
              <th className="r">Precio negociado</th>
              <th className="r">Ahorro estimado</th>
            </tr>
          </thead>
          <tbody>
            {report.items.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "#718096" }}>
                  No hay insumos comprados que haga falta reponer este mes.
                </td>
              </tr>
            ) : (
              report.items.map((i) => (
                <tr key={i.key}>
                  <td>{i.label}</td>
                  <td className="r">
                    {formatG1Number(i.quantity)} {i.unit}
                  </td>
                  <td className="r">{i.currentPrice == null ? "—" : money(i.currentPrice)}</td>
                  <td className="r">{i.negotiated == null ? "—" : money(i.negotiated)}</td>
                  <td className="r">{i.savings == null ? "—" : money(i.savings)}</td>
                </tr>
              ))
            )}
            <tr className="tot">
              <td>Total</td>
              <td className="r" />
              <td className="r" />
              <td className="r" />
              <td className="r">{money(report.savings.total)}</td>
            </tr>
          </tbody>
        </table>
        <SheetNote>
          Ahorro = (precio actual − precio negociado) × cantidad. Precio actual: promedio ponderado de lo que paga cada
          comedor.
        </SheetNote>
      </section>

      {main && (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SectionHead
            title={`Precio del ${main.unit === "L" ? "litro" : main.unit === "kg" ? "kilo" : "unidad"} de ${main.label.toLowerCase()} por comedor, frente al grupo`}
            chip="Solo supervisión"
            tone="muted"
            icon="visibility"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "160px minmax(0, 1fr) minmax(0, 1fr) 56px 44px",
              gap: "2px 0",
              alignItems: "center",
              fontSize: 13,
              lineHeight: "18px",
            }}
          >
            <span />
            <span style={{ fontSize: 12, lineHeight: "16px", color: "#475569", textAlign: "right", paddingRight: 8 }}>
              Paga menos
            </span>
            <span style={{ fontSize: 12, lineHeight: "16px", color: "#475569", paddingLeft: 8 }}>Paga más</span>
            <span />
            <span />
            {report.chart.map((c) => {
              const more = c.diff > 1e-9;
              const less = c.diff < -1e-9;
              return (
                <ChartRow
                  key={c.id}
                  nombre={c.nombre}
                  price={money(c.price)}
                  diff={percentSigned(c.diff)}
                  width={c.width}
                  more={more}
                  less={less}
                  high={c.high}
                />
              );
            })}
          </div>
          <SheetNote>
            Precio de cada comedor ÷ precio del grupo ({money(main.groupPrice)}). Los que pagan más son los que más ahorran
            comprando juntos.
          </SheetNote>
        </section>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr)",
          gap: 32,
          marginTop: "auto",
          alignItems: "end",
        }}
      >
        <SignatureLine label="Proveedor y fecha de entrega" muted />
        <SignatureLine label="Coordinadora del grupo" />
        <SignatureLine label="Supervisora" />
      </div>
    </ReportSheet>
  );
}

function ChartRow({
  nombre,
  price,
  diff,
  width,
  more,
  less,
  high,
}: {
  nombre: string;
  price: string;
  diff: string;
  width: number;
  more: boolean;
  less: boolean;
  high: boolean;
}) {
  return (
    <>
      <span>{nombre}</span>
      <div style={{ display: "flex", justifyContent: "flex-end", height: 10 }}>
        {less && <div style={{ width: `${width * 100}%`, height: 10, background: "#2656C9" }} />}
      </div>
      <div style={{ borderLeft: "1px solid #111111", height: 10, display: "flex" }}>
        {more && <div style={{ width: `${width * 100}%`, height: 10, background: RED }} />}
      </div>
      <span className="num" style={NUM}>
        {price}
      </span>
      <span className="num" style={{ ...NUM, ...(high ? { fontWeight: 700, color: RED } : {}) }}>
        {diff}
      </span>
    </>
  );
}
