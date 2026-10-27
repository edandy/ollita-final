import type { CSSProperties, Ref } from "react";
import { formatG1Number } from "@/lib/g1";
import { formatG7People } from "@/lib/g7";
import type { G8Report } from "@/lib/g8";
import { Meta, MetaBand, ReportPreview, ReportSheet, displayName } from "@/components/admin/report-sheet";

const H2: CSSProperties = { margin: 0, fontSize: 15, lineHeight: "20px", fontWeight: 700, color: "#072249" };
const MUTED: CSSProperties = { fontSize: 12, lineHeight: "16px", color: "#475569" };

export function G8ReportPreview({
  report,
  sheetRef,
}: {
  report: G8Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return <ReportPreview sheetRef={sheetRef} renderSheet={(ref) => <G8ReportSheet report={report} ref={ref} />} />;
}

function BigKpi({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return (
    <div
      style={{
        ...(dark ? { background: "#072249" } : { border: "1px solid #E0E0E0" }),
        borderRadius: 12,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <span style={{ fontSize: 12, lineHeight: "16px", color: dark ? "#D4E7FF" : "#475569" }}>{label}</span>
      <span
        className="num"
        style={{ fontSize: 24, lineHeight: "30px", fontWeight: 700, color: dark ? "#FFFFFF" : "#072249" }}
      >
        {value}
      </span>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function Photo({ src, empty }: { src: string | null; empty: string }) {
  const box: CSSProperties = { height: 96, borderRadius: 12, overflow: "hidden" };
  if (src) {
    return (
      <div style={box}>
        <img src={src} alt="" style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />
      </div>
    );
  }
  return (
    <div
      style={{
        ...box,
        border: "1.5px dashed #9197B3",
        background: "#F0F0F0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        ...MUTED,
        textAlign: "center",
      }}
    >
      <CameraIcon />
      {empty}
    </div>
  );
}

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function amount(qty: number, unit: string) {
  return `${formatG1Number(Math.round(qty))} ${unit}`;
}

function perServing(grams: number, unit: string) {
  if (!grams) return "—";
  if (unit === "kg") return `${Math.round(grams)} g`;
  if (unit === "L") return `${Math.round(grams)} ml`;
  return "—";
}

function daysText(range: G8Report["daysRange"]) {
  if (!range) return "—";
  return range.min === range.max ? String(range.max) : `${range.min} a ${range.max}`;
}

export function G8ReportSheet({ report, ref }: { report: G8Report; ref?: Ref<HTMLElement | null> }) {
  const donor = report.version === "donor";
  const mainColumn = report.columns.findIndex((c) => report.products.find((p) => p.key === c.key)?.main);
  const mainTotal = report.kitchens.reduce((s, k) => s + (k.quantities[mainColumn] ?? 0), 0);
  const totalServings = report.kitchens.reduce((s, k) => s + k.servings, 0);

  return (
    <ReportSheet
      code="G8"
      title="Donación al grupo"
      cadence="Por donación"
      audience="Para donantes"
      chip={donor ? "Para todos · sin nombres" : "Solo supervisión · con nombres"}
      chipTone={donor ? "accent" : "muted"}
      footerNote={donor ? "Sin datos personales ni de caja" : "Uso de supervisión: no se comparte con el donante"}
      sheetRef={ref}
    >
      <MetaBand columns="repeat(4, minmax(0, 1fr))">
        <Meta label="Donante" value={report.donorName} />
        <Meta label="Lote" value={report.donation.code} />
        <Meta label="Recibido por el grupo" value={shortDate(report.donation.receivedOn)} numeric />
        <Meta
          label="Estado"
          value={
            report.status.done
              ? "Consumido al 100%"
              : `En uso · ${Math.round(report.status.consumed * 100)}% consumido`
          }
        />
      </MetaBand>

      <p style={{ margin: 0, fontSize: 16, lineHeight: "24px", color: "#111111" }}>{report.lead}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <BigKpi label="Raciones que rindió" value={report.servingsKpi} dark />
        <BigKpi label="Personas alimentadas" value={formatG7People(report.people)} />
        <BigKpi label="Comedores" value={`${report.coverage.kitchens} de ${report.coverage.total}`} />
        <BigKpi label="Días que duró" value={daysText(report.daysRange)} />
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Qué recibió el grupo y cuánto rindió</h2>
        <table className="g1-tb">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="r">Cantidad</th>
              <th className="r">Por ración</th>
              <th className="r">Raciones</th>
              <th style={{ paddingLeft: 16 }}>Cómo se calcula</th>
            </tr>
          </thead>
          <tbody>
            {report.products.map((p) => (
              <tr key={p.key}>
                <td style={{ fontWeight: 600 }}>{p.label}</td>
                <td className="r">{amount(p.quantity, p.unit)}</td>
                <td className="r">{perServing(p.perServing, p.unit)}</td>
                <td className="r">≈ {formatG1Number(Math.round(p.servings / 100) * 100)}</td>
                <td style={{ paddingLeft: 16 }}>
                  {p.main ? "Kilos de cada comedor ÷ su rendimiento" : "Servidas dentro de las mismas raciones"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Cómo se repartió entre los comedores</h2>
        <div
          style={{ display: "flex", height: 14, gap: 2 }}
          role="img"
          aria-label={`Reparto entre ${report.kitchens.length} comedores`}
        >
          {report.kitchens.map((k, i) => {
            const share = mainTotal ? (k.quantities[mainColumn] ?? 0) / mainTotal : 0;
            const last = i === report.kitchens.length - 1;
            return (
              <div
                key={k.id}
                style={{
                  ...(last ? { flex: 1 } : { width: `${share * 100}%` }),
                  background: i % 2 ? "#2656C9" : "#072249",
                }}
              />
            );
          })}
        </div>
        <table className="g1-tb">
          <thead>
            <tr>
              <th>Comedor</th>
              {report.columns.map((c) => (
                <th key={c.key} className="r">
                  {c.label}
                </th>
              ))}
              <th className="r">Raciones</th>
              <th className="r">Duró</th>
            </tr>
          </thead>
          <tbody>
            {report.kitchens.map((k) => (
              <tr key={k.id}>
                <td>{displayName(k.label)}</td>
                {report.columns.map((c, i) => (
                  <td key={c.key} className="r">
                    {k.quantities[i] ? amount(k.quantities[i]!, c.unit) : "—"}
                  </td>
                ))}
                <td className="r">{formatG1Number(Math.round(k.servings))}</td>
                <td className="r">{k.days === 1 ? "1 día" : `${k.days} días`}</td>
              </tr>
            ))}
            <tr className="tot">
              <td>Grupo</td>
              {report.columns.map((c, i) => (
                <td key={c.key} className="r">
                  {amount(
                    report.kitchens.reduce((s, k) => s + (k.quantities[i] ?? 0), 0),
                    c.unit,
                  )}
                </td>
              ))}
              <td className="r">{formatG1Number(Math.round(totalServings))}</td>
              <td className="r">{report.daysRange ? `${daysText(report.daysRange)} días` : "—"}</td>
            </tr>
          </tbody>
        </table>
        <span style={MUTED}>
          {donor
            ? "Para el donante los comedores van con letras. La supervisión del grupo ve el mismo reparto con nombres."
            : "Versión de supervisión, con los nombres de los comedores. Al donante se le entrega con letras."}
        </span>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <h2 style={{ ...H2, marginRight: 8 }}>En qué platos</h2>
          {report.dishes.length === 0 ? (
            <span style={MUTED}>Sin menús publicados mientras duró.</span>
          ) : (
            report.dishes.map((d) => (
              <span
                key={d}
                style={{
                  padding: "4px 12px",
                  background: "#D4E7FF",
                  borderRadius: 9999,
                  fontSize: 13,
                  lineHeight: "18px",
                  fontWeight: 600,
                  color: "#072249",
                }}
              >
                {d}
              </span>
            ))
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
          <Photo src={report.photos.dish} empty="Sin foto de un plato preparado con la donación" />
          <Photo src={report.photos.kitchen} empty="Sin foto de la cocina de uno de los comedores" />
        </div>
      </section>
    </ReportSheet>
  );
}
