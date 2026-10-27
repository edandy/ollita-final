import type { CSSProperties, ReactNode, Ref } from "react";
import { formatG1Number, formatG1Percent } from "@/lib/g1";
import { formatG7People, type G7Report } from "@/lib/g7";
import { Kpi, Meta, MetaBand, ReportPreview, ReportSheet } from "@/components/admin/report-sheet";

const MUTED: CSSProperties = { fontSize: 12, lineHeight: "16px", color: "#475569" };
const H2: CSSProperties = { margin: 0, fontSize: 15, lineHeight: "20px", fontWeight: 700, color: "#072249" };
const CATEGORY_COLORS = ["#072249", "#2656C9", "#009EF9", "#9197B3", "#D4E7FF"];
const BAR_MAX = 88;

export function G7ReportPreview({
  report,
  sheetRef,
}: {
  report: G7Report;
  sheetRef?: Ref<HTMLElement | null>;
}) {
  return <ReportPreview sheetRef={sheetRef} renderSheet={(ref) => <G7ReportSheet report={report} ref={ref} />} />;
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={H2}>{title}</h2>
      {children}
    </section>
  );
}

function InfoIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#2656C9"
      strokeWidth={2}
      strokeLinecap="round"
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

function percent(share: number) {
  return formatG1Percent(share);
}

/** "1 de cada 4": how many padrón people per one who ate 20 days or more. */
function frequentText(share: number) {
  if (share <= 0) return "Ninguna persona del padrón comió en algún comedor del grupo 20 días o más del mes.";
  const n = Math.max(1, Math.round(1 / share));
  if (n === 1) return "Casi todas las personas del padrón comieron en algún comedor del grupo 20 días o más del mes.";
  return `1 de cada ${n} personas del padrón comió en algún comedor del grupo 20 días o más del mes.`;
}

export function G7ReportSheet({ report, ref }: { report: G7Report; ref?: Ref<HTMLElement | null> }) {
  const { team, gap } = report;
  const maxWeek = Math.max(0, ...report.weeks.map((w) => w.servings));
  const maxBucket = Math.max(0, ...report.dependency.map((d) => d.share));
  const shown = report.categories.map((c) => ({ ...c, small: c.people > 0 && c.people < 5 }));

  return (
    <ReportSheet
      code="G7"
      title="Impacto del grupo"
      cadence="Mensual"
      audience="Para aliados"
      chip="Para todos · solo totales"
      chipTone="accent"
      footerNote="Datos agregados y anónimos"
      gap={13}
      sheetRef={ref}
    >
      <MetaBand columns="repeat(4, minmax(0, 1fr))">
        <Meta label="Aliado" value={report.allyName ?? "Todo el grupo"} />
        <Meta label="Grupo" value={`${report.coverage.total} comedores · ${report.groupName}`} />
        <Meta
          label="Período"
          value={
            report.month.until
              ? `${report.month.label} (al ${report.month.until.slice(8)}/${report.month.until.slice(5, 7)})`
              : report.month.label
          }
        />
        <Meta label="Cobertura" value={`${report.coverage.withData} de ${report.coverage.total} con datos`} numeric />
      </MetaBand>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <BigKpi label="Raciones servidas" value={formatG1Number(report.servings)} dark />
        <BigKpi label="Personas atendidas" value={formatG7People(report.people)} />
        <BigKpi label="Personas alcanzadas" value={formatG7People(report.reached)} />
        <BigKpi label="Carga familiar promedio" value={report.averageLoad.toFixed(1)} />
      </div>
      <span style={{ ...MUTED, marginTop: -5 }}>
        Cada persona se cuenta una vez aunque recoja en más de un comedor. Alcanzadas suma a las familias del padrón.
      </span>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 32 }}>
        <Section title="Raciones por semana">
          <div
            role="img"
            aria-label={`Raciones por semana: ${report.weeks.map((w) => formatG1Number(w.servings)).join(", ")}`}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(1, report.weeks.length)}, minmax(0, 1fr))`,
              gap: 10,
              alignItems: "end",
              height: 108,
              borderBottom: "1px solid #111111",
            }}
          >
            {report.weeks.map((w) => (
              <div
                key={w.label}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3 }}
              >
                <span className="num" style={{ fontSize: 12, lineHeight: "14px", color: "#475569" }}>
                  {formatG1Number(w.servings)}
                </span>
                <div
                  style={{
                    width: "100%",
                    height: maxWeek ? Math.round((w.servings / maxWeek) * BAR_MAX) : 0,
                    background: "#2656C9",
                  }}
                />
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.max(1, report.weeks.length)}, minmax(0, 1fr))`,
              gap: 10,
              ...MUTED,
              textAlign: "center",
            }}
          >
            {report.weeks.map((w) => (
              <span key={w.label}>{w.label}</span>
            ))}
          </div>
          {report.partialWeeks && <span style={MUTED}>La primera y la última semana tienen menos días de atención.</span>}
        </Section>

        <Section title="A quiénes se atendió">
          <div style={{ display: "flex", height: 12, gap: 2 }}>
            {shown.map((c, i) =>
              c.share > 0 ? (
                <div key={c.key} style={{ width: `${c.share * 100}%`, background: CATEGORY_COLORS[i] }} />
              ) : null,
            )}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "12px minmax(0, 1fr) 40px",
              gap: "5px 8px",
              alignItems: "center",
              fontSize: 13,
              lineHeight: "18px",
            }}
          >
            {shown.map((c, i) => (
              <Legend key={c.key} color={CATEGORY_COLORS[i]!} outlined={i === CATEGORY_COLORS.length - 1}>
                <span>{c.label}</span>
                <span className="num" style={{ textAlign: "right" }}>
                  {c.small ? "—" : percent(c.share)}
                </span>
              </Legend>
            ))}
          </div>
          <span style={MUTED}>
            Personas del padrón por categoría. El padrón recibió el {percent(report.padronShare)} de las raciones; el
            público, el {percent(report.servings ? 1 - report.padronShare : 0)}.
          </span>
        </Section>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 32 }}>
        <Section title="Cuánto dependen de los comedores">
          <span style={MUTED}>Personas del padrón según los días con ración, en cualquier comedor del grupo</span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "96px minmax(0, 1fr) 40px",
              gap: "7px 8px",
              alignItems: "center",
              fontSize: 13,
              lineHeight: "18px",
            }}
          >
            {report.dependency.map((d) => (
              <DependencyRow key={d.label} label={d.label} share={d.share} max={maxBucket} />
            ))}
          </div>
          <span style={{ fontSize: 13, lineHeight: "18px" }}>{frequentText(report.frequentShare)}</span>
        </Section>

        <Section title="De dónde vienen los alimentos">
          <table className="g1-tb">
            <thead>
              <tr>
                <th>Origen</th>
                <th className="r">Kilos</th>
                <th className="r">%</th>
              </tr>
            </thead>
            <tbody>
              {report.origins.map((o) => (
                <tr key={o.key}>
                  <td>{o.label}</td>
                  <td className="r">{formatG1Number(Math.round(o.kilos))}</td>
                  <td className="r">{Math.round(o.share * 100)}</td>
                </tr>
              ))}
              <tr className="tot">
                <td>Total</td>
                <td className="r">{formatG1Number(Math.round(report.kilos))}</td>
                <td className="r">{report.kilos ? 100 : 0}</td>
              </tr>
            </tbody>
          </table>
          <div style={{ padding: "8px 12px", background: "#F0F0F0", borderRadius: 8, fontSize: 13, lineHeight: "18px" }}>
            <strong>Brecha de fin de mes:</strong>{" "}
            {gap
              ? `lo municipal se acabó, en promedio, el día ${gap.averageDay}. El ${percent(gap.servingsAfterShare)} de las raciones del grupo se sirvió después.`
              : "lo municipal alcanzó todo el mes."}
          </div>
        </Section>
      </div>

      <Section title="Las organizaciones detrás de las raciones">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <Kpi
            label="Trabajo voluntario de las socias"
            value={`≈ ${formatG1Number(Math.round(team.hours / 10) * 10)} horas`}
            hint={`Unas ${formatG7People(team.sociasEnTurnos).replace("~", "")} socias en turnos de cocina`}
          />
          <Kpi
            label="Mujeres en cargos directivos"
            value={team.womenRate == null ? "—" : percent(team.womenRate)}
            hint="En las directivas del grupo"
          />
          <Kpi
            label="Comedores que reportan"
            value={`${report.coverage.withData} de ${report.coverage.total}`}
            hint="Con datos completos en el mes"
          />
        </div>
      </Section>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          gap: 10,
          padding: "10px 14px",
          border: "1px solid #E0E0E0",
          borderRadius: 12,
          ...MUTED,
        }}
      >
        <InfoIcon />
        <span>
          Solo totales del grupo: no muestra comedores por nombre. Ningún grupo de menos de 5 personas se muestra por
          separado y las cifras pequeñas se redondean. No incluye nombres, DNI, direcciones ni datos de caja.
        </span>
      </div>
    </ReportSheet>
  );
}

function Legend({ color, outlined, children }: { color: string; outlined: boolean; children: ReactNode }) {
  return (
    <>
      <span
        style={{
          width: 10,
          height: 10,
          background: color,
          ...(outlined ? { boxShadow: "inset 0 0 0 1px #475569" } : {}),
        }}
      />
      {children}
    </>
  );
}

function DependencyRow({ label, share, max }: { label: string; share: number; max: number }) {
  return (
    <>
      <span>{label}</span>
      <div style={{ height: 10, background: "#072249", width: `${max ? (share / max) * 100 : 0}%` }} />
      <span className="num" style={{ textAlign: "right" }}>
        {formatG1Percent(share)}
      </span>
    </>
  );
}
