import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { AdminSelect } from "@/components/admin/admin-select";
import { G1ReportPreview } from "@/components/admin/g1-report";
import { G2ReportPreview } from "@/components/admin/g2-report";
import { G3ReportPreview } from "@/components/admin/g3-report";
import { G4ReportPreview } from "@/components/admin/g4-report";
import { G5ReportPreview } from "@/components/admin/g5-report";
import { G6ReportPreview } from "@/components/admin/g6-report";
import { G7ReportPreview } from "@/components/admin/g7-report";
import { G8ReportPreview } from "@/components/admin/g8-report";
import { G9ReportPreview } from "@/components/admin/g9-report";
import { G10ReportPreview } from "@/components/admin/g10-report";
import { G11ReportPreview } from "@/components/admin/g11-report";
import { listReportDonations } from "@/lib/donations.functions";
import { listReportAllies } from "@/lib/allies.functions";
import { useAdminLayout } from "@/lib/admin-layout-context";
import { todayISO } from "@/lib/dates";
import { shiftWeek, weekRangeMonSat, type G1Report } from "@/lib/g1";
import {
  downloadG1Pdf,
  g1PdfFilename,
  g2PdfFilename,
  g3PdfFilename,
  g4PdfFilename,
  g5PdfFilename,
  g6PdfFilename,
  g7PdfFilename,
  g8PdfFilename,
  g9PdfFilename,
  g10PdfFilename,
  g11PdfFilename,
} from "@/lib/g1-pdf";
import { getG1Report, listReportGroups } from "@/lib/g1.functions";
import type { G2Report } from "@/lib/g2";
import { getG2Report } from "@/lib/g2.functions";
import { monthRange, shiftMonth, type G3Report } from "@/lib/g3";
import { getG3Report } from "@/lib/g3.functions";
import { shiftYear, yearRange, type G4Mode, type G4Report } from "@/lib/g4";
import { getG4Report } from "@/lib/g4.functions";
import type { G5Report } from "@/lib/g5";
import { getG5Report } from "@/lib/g5.functions";
import type { G6Report } from "@/lib/g6";
import { getG6Report } from "@/lib/g6.functions";
import type { G7Report } from "@/lib/g7";
import { getG7Report } from "@/lib/g7.functions";
import type { G8Report, G8Version } from "@/lib/g8";
import { getG8Report } from "@/lib/g8.functions";
import type { G9Report } from "@/lib/g9";
import { getG9Report } from "@/lib/g9.functions";
import type { G10Report } from "@/lib/g10";
import { getG10Report } from "@/lib/g10.functions";
import type { G11Report } from "@/lib/g11";
import { getG11Report } from "@/lib/g11.functions";
import type { GroupRow } from "@/lib/groups.functions";
import { notifyError } from "@/lib/notify";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { useSubmitLock } from "@/lib/submit-lock";

export const Route = createFileRoute("/_authenticated/admin/reportes")({
  head: () => ({
    meta: [{ title: "Reportes — La Ollita" }],
  }),
  component: ReportesPage,
});

const REPORT_OPTIONS = [
  { value: "g1", badge: "G1", label: "Raciones del grupo", hint: "Semanal", group: "Semanales" },
  { value: "g2", badge: "G2", label: "Almacén del grupo", hint: "Semanal", group: "Semanales" },
  { value: "g6", badge: "G6", label: "Alertas del grupo", hint: "Semanal", group: "Semanales" },
  { value: "g9", badge: "G9", label: "Adopción y calidad de datos", hint: "Semanal", group: "Semanales" },
  { value: "g10", badge: "G10", label: "Excedentes y faltantes", hint: "Semanal", group: "Semanales" },
  { value: "g3", badge: "G3", label: "Rendimiento de insumos", hint: "Mensual", group: "Mensuales" },
  { value: "g5", badge: "G5", label: "Equipo y turnos", hint: "Mensual", group: "Mensuales" },
  { value: "g7", badge: "G7", label: "Impacto del grupo", hint: "Mensual · para aliados", group: "Mensuales" },
  { value: "g11", badge: "G11", label: "Compras conjuntas", hint: "Mensual · para el mes que viene", group: "Mensuales" },
  { value: "g4", badge: "G4", label: "Padrón del grupo", hint: "Por mes o por año", group: "Mes o año" },
  { value: "g8", badge: "G8", label: "Donación al grupo", hint: "Por lote de donación", group: "Por donación" },
] as const;

type ReportKind = (typeof REPORT_OPTIONS)[number]["value"];

type LoadedReport =
  | { kind: "g1"; data: G1Report }
  | { kind: "g2"; data: G2Report }
  | { kind: "g3"; data: G3Report }
  | { kind: "g4"; data: G4Report }
  | { kind: "g5"; data: G5Report }
  | { kind: "g6"; data: G6Report }
  | { kind: "g7"; data: G7Report }
  | { kind: "g8"; data: G8Report }
  | { kind: "g9"; data: G9Report }
  | { kind: "g10"; data: G10Report }
  | { kind: "g11"; data: G11Report };

type PeriodKind = "week" | "month" | "year";

const PERIOD_COPY: Record<PeriodKind, { label: string; previous: string; next: string }> = {
  week: { label: "Semana (lun–sáb)", previous: "Semana anterior", next: "Semana siguiente" },
  month: { label: "Mes", previous: "Mes anterior", next: "Mes siguiente" },
  year: { label: "Año", previous: "Año anterior", next: "Año siguiente" },
};

function ReportesPage() {
  const { isAdmin, setSubtitleCount } = useAdminLayout();
  const fnGroups = useServerFn(listReportGroups);
  const fnG1 = useServerFn(getG1Report);
  const fnG2 = useServerFn(getG2Report);
  const fnG3 = useServerFn(getG3Report);
  const fnG4 = useServerFn(getG4Report);
  const fnG5 = useServerFn(getG5Report);
  const fnG6 = useServerFn(getG6Report);
  const fnG7 = useServerFn(getG7Report);
  const fnAllies = useServerFn(listReportAllies);
  const fnG8 = useServerFn(getG8Report);
  const fnDonations = useServerFn(listReportDonations);
  const fnG9 = useServerFn(getG9Report);
  const fnG10 = useServerFn(getG10Report);
  const fnG11 = useServerFn(getG11Report);
  const [kind, setKind] = useState<ReportKind>("g1");
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState("");
  const [weekStart, setWeekStart] = useState(() => weekRangeMonSat(todayISO()).from);
  const [monthStart, setMonthStart] = useState(() => monthRange(todayISO()).from);
  const [yearStart, setYearStart] = useState(() => yearRange(todayISO()).from);
  const [g4Mode, setG4Mode] = useState<G4Mode>("month");
  const [allies, setAllies] = useState<{ id: string; name: string }[] | null>(null);
  const [allyId, setAllyId] = useState("");
  const [donations, setDonations] = useState<{ id: string; code: string; donorName: string; receivedOn: string }[] | null>(null);
  const [donationId, setDonationId] = useState("");
  const [g8Version, setG8Version] = useState<G8Version>("donor");
  const [report, setReport] = useState<LoadedReport | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sheetRef = useRef<HTMLElement>(null);
  const { pending: exporting, run: runExport } = useSubmitLock();

  const week = weekRangeMonSat(weekStart);
  const periodKind: PeriodKind = kind === "g3" || kind === "g5" || kind === "g7" || kind === "g11" ? "month" : kind === "g4" ? g4Mode : "week";
  const periodLabel =
    periodKind === "year" ? yearRange(yearStart).label : periodKind === "month" ? monthRange(monthStart).label : week.label;
  const shiftPeriod = (step: number) => {
    if (periodKind === "year") setYearStart((y) => shiftYear(y, step));
    else if (periodKind === "month") setMonthStart((m) => shiftMonth(m, step));
    else setWeekStart((w) => shiftWeek(w, step));
  };

  useEffect(() => {
    fnGroups({})
      .then((rows) => {
        setGroups(rows);
        setSubtitleCount(rows.length);
        setGroupId((cur) => cur || rows[0]?.id || "");
      })
      .catch((e: any) => {
        void notifyError(friendlySupabaseError(e?.message ?? "No pudimos cargar los grupos."));
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (kind !== "g7" || !groupId) return;
    let cancelled = false;
    setAllies(null);
    fnAllies({ data: { groupId } })
      .then((rows) => {
        if (cancelled) return;
        setAllies(rows);
        setAllyId((cur) => (rows.some((a) => a.id === cur) ? cur : rows[0]?.id ?? ""));
      })
      .catch((e: any) => {
        if (cancelled) return;
        setAllies([]);
        setAllyId("");
        void notifyError(friendlySupabaseError(e?.message ?? "No pudimos cargar los aliados."));
      });
    return () => {
      cancelled = true;
    };
  }, [kind, groupId]);

  useEffect(() => {
    if (kind !== "g8" || !groupId) return;
    let cancelled = false;
    setDonations(null);
    fnDonations({ data: { groupId } })
      .then((rows) => {
        if (cancelled) return;
        setDonations(rows);
        setDonationId((cur) => (rows.some((d) => d.id === cur) ? cur : rows[0]?.id ?? ""));
      })
      .catch((e: any) => {
        if (cancelled) return;
        setDonations([]);
        setDonationId("");
        void notifyError(friendlySupabaseError(e?.message ?? "No pudimos cargar las donaciones."));
      });
    return () => {
      cancelled = true;
    };
  }, [kind, groupId]);

  useEffect(() => {
    // G7 and G8 wait for the group's allies or lots so they load once with the right one.
    if (kind === "g7" && groupId && allies === null) return;
    if (kind === "g8" && groupId && donations === null) return;
    if (kind === "g8" && groupId && !donationId) {
      setReport(null);
      setEmptyMessage("Este grupo aún no tiene donaciones registradas.");
      setLoading(false);
      return;
    }
    if (!groupId) {
      setReport(null);
      setEmptyMessage(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const load: Promise<{ report: LoadedReport; emptyMessage: string | null }> =
      kind === "g1"
        ? fnG1({ data: { groupId, weekStart } }).then((r) => ({
            report: { kind: "g1", data: r.report },
            emptyMessage: r.emptyMessage,
          }))
        : kind === "g2"
          ? fnG2({ data: { groupId, weekStart } }).then((r) => ({
              report: { kind: "g2", data: r.report },
              emptyMessage: r.emptyMessage,
            }))
          : kind === "g3"
            ? fnG3({ data: { groupId, monthStart } }).then((r) => ({
                report: { kind: "g3", data: r.report },
                emptyMessage: r.emptyMessage,
              }))
            : kind === "g4"
              ? fnG4({ data: { groupId, mode: g4Mode, start: g4Mode === "year" ? yearStart : monthStart } }).then(
                  (r) => ({ report: { kind: "g4", data: r.report }, emptyMessage: r.emptyMessage }),
                )
              : kind === "g5"
                ? fnG5({ data: { groupId, monthStart } }).then((r) => ({
                    report: { kind: "g5", data: r.report },
                    emptyMessage: r.emptyMessage,
                  }))
                : kind === "g6"
                  ? fnG6({ data: { groupId, weekStart } }).then((r) => ({
                      report: { kind: "g6", data: r.report },
                      emptyMessage: r.emptyMessage,
                    }))
                  : kind === "g7"
                    ? fnG7({ data: { groupId, allyId, monthStart } }).then((r) => ({
                        report: { kind: "g7", data: r.report },
                        emptyMessage: r.emptyMessage,
                      }))
                    : kind === "g8"
                      ? fnG8({ data: { groupId, donationId, version: g8Version } }).then((r) => ({
                          report: { kind: "g8", data: r.report },
                          emptyMessage: r.emptyMessage,
                        }))
                      : kind === "g9"
                        ? fnG9({ data: { groupId, weekStart } }).then((r) => ({
                            report: { kind: "g9", data: r.report },
                            emptyMessage: r.emptyMessage,
                          }))
                        : kind === "g10"
                          ? fnG10({ data: { groupId, weekStart } }).then((r) => ({
                              report: { kind: "g10", data: r.report },
                              emptyMessage: r.emptyMessage,
                            }))
                          : fnG11({ data: { groupId, monthStart } }).then((r) => ({
                              report: { kind: "g11", data: r.report },
                              emptyMessage: r.emptyMessage,
                            }));
    load
      .then((r) => {
        if (cancelled) return;
        setReport(r.report);
        setEmptyMessage(r.emptyMessage);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setReport(null);
        void notifyError(friendlySupabaseError(e?.message ?? "No pudimos armar el reporte."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId, weekStart, monthStart, yearStart, g4Mode, kind, allyId, allies, donationId, donations, g8Version]);

  const exportPdf = () => {
    const sheet =
      sheetRef.current ?? document.querySelector<HTMLElement>(".g1-print-root .g1-sheet");
    if (!report || !sheet) {
      void notifyError("No pudimos generar el PDF. Recarga la página e inténtalo de nuevo.");
      return;
    }
    void runExport(async () => {
      try {
        const filename =
          report.kind === "g1"
            ? g1PdfFilename(report.data.groupName, report.data.week.from, report.data.week.to)
            : report.kind === "g2"
              ? g2PdfFilename(report.data.groupName, report.data.week.from, report.data.week.to)
              : report.kind === "g3"
                ? g3PdfFilename(report.data.groupName, report.data.month.from)
                : report.kind === "g4"
                  ? g4PdfFilename(report.data.groupName, report.data.period.mode, report.data.period.from)
                  : report.kind === "g5"
                    ? g5PdfFilename(report.data.groupName, report.data.month.from)
                    : report.kind === "g6"
                      ? g6PdfFilename(report.data.groupName, report.data.week.from, report.data.week.to)
                      : report.kind === "g7"
                        ? g7PdfFilename(report.data.groupName, report.data.allyName, report.data.month.from)
                        : report.kind === "g8"
                          ? g8PdfFilename(report.data.donation.code, report.data.version)
                          : report.kind === "g9"
                            ? g9PdfFilename(report.data.groupName, report.data.week.from, report.data.week.to)
                            : report.kind === "g10"
                              ? g10PdfFilename(report.data.groupName, report.data.week.from, report.data.week.to)
                              : g11PdfFilename(report.data.groupName, report.data.month.from);
        await downloadG1Pdf(sheet, filename);
      } catch (err) {
        console.error(err);
        void notifyError("No pudimos generar el PDF. Inténtalo de nuevo.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="g1-no-print bg-white border border-[#E0E0E0] rounded-[20px] p-4 sm:p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-end">
        <AdminSelect
          label="Reporte"
          value={kind}
          onValueChange={(v) => {
            const next = v as ReportKind;
            setKind(next);
            // A joint purchase is for a month to come: skip the month already running.
            if (next === "g11" && monthStart <= todayISO()) setMonthStart(shiftMonth(todayISO(), 1));
          }}
          options={[...REPORT_OPTIONS]}
        />
        <AdminSelect
          label="Grupo"
          value={groupId}
          onValueChange={setGroupId}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
          placeholder="Sin grupos"
          size="lg"
        />
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-1">
          {kind === "g7" && (
            <AdminSelect
              label="Aliado"
              value={allyId}
              onValueChange={setAllyId}
              disabled={allies === null}
              size="lg"
              className="min-w-[220px] flex-1"
              options={[
                ...(allies ?? []).map((a) => ({ value: a.id, label: a.name })),
                { value: "", label: "Todo el grupo" },
              ]}
            />
          )}
          {kind === "g8" && (
            <>
              <AdminSelect
                label="Lote"
                value={donationId}
                onValueChange={setDonationId}
                disabled={donations === null}
                size="lg"
                className="min-w-[220px] flex-1"
                placeholder="Sin lotes"
                options={(donations ?? []).map((d) => ({ value: d.id, label: `${d.code} · ${d.donorName}` }))}
              />
              <Segmented
                label="Versión"
                value={g8Version}
                onChange={setG8Version}
                options={[
                  ["donor", "Donante"],
                  ["supervision", "Supervisión"],
                ]}
              />
            </>
          )}
          {kind === "g4" && (
            <Segmented
              label="Período"
              value={g4Mode}
              onChange={setG4Mode}
              options={[
                ["month", "Mes"],
                ["year", "Año"],
              ]}
            />
          )}
          {kind !== "g8" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[15px] font-semibold text-bosque">{PERIOD_COPY[periodKind].label}</span>
              <div className="flex h-16 items-center gap-1 rounded-xl border border-[#E0E0E0] bg-white px-2">
                <button
                  type="button"
                  onClick={() => shiftPeriod(-1)}
                  className="grid size-10 place-items-center rounded-lg text-[#475569] hover:bg-[#C5EBF9] hover:text-[#072249] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7BA8]/40"
                  aria-label={PERIOD_COPY[periodKind].previous}
                >
                  <ChevronLeft size={22} />
                </button>
                <span className="min-w-[168px] text-center text-[17px] font-semibold text-[#072249] tabular-nums">
                  {periodLabel}
                </span>
                <button
                  type="button"
                  onClick={() => shiftPeriod(1)}
                  className="grid size-10 place-items-center rounded-lg text-[#475569] hover:bg-[#C5EBF9] hover:text-[#072249] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7BA8]/40"
                  aria-label={PERIOD_COPY[periodKind].next}
                >
                  <ChevronRight size={22} />
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={exportPdf}
            disabled={!report || exporting}
            className="min-h-16 px-6 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold inline-flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60 ml-auto"
          >
            <Printer size={20} /> {exporting ? "Generando…" : "Exportar PDF"}
          </button>
        </div>
      </div>

      {groups.length === 0 && !loading && (
        <p className="text-[17px] text-[#718096] bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-5">
          {isAdmin
            ? "Aún no hay grupos. Créalos en Grupos para armar este consolidado."
            : "No hay grupos con ollas que tengas asignadas."}
        </p>
      )}

      {loading && <p className="text-[17px] text-[#718096]">Armando el reporte…</p>}

      {!loading && emptyMessage && (
        <p className="text-[17px] text-[#718096] bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-5">
          {emptyMessage}
        </p>
      )}

      {!loading && report && !emptyMessage && (
        <div className="print:mx-0">
          {report.kind === "g1" ? (
            <G1ReportPreview report={report.data} sheetRef={sheetRef} />
          ) : report.kind === "g2" ? (
            <G2ReportPreview report={report.data} sheetRef={sheetRef} />
          ) : report.kind === "g3" ? (
            <G3ReportPreview report={report.data} sheetRef={sheetRef} />
          ) : report.kind === "g4" ? (
            <G4ReportPreview report={report.data} sheetRef={sheetRef} />
          ) : report.kind === "g5" ? (
            <G5ReportPreview report={report.data} sheetRef={sheetRef} />
          ) : report.kind === "g6" ? (
            <G6ReportPreview report={report.data} sheetRef={sheetRef} />
          ) : report.kind === "g7" ? (
            <G7ReportPreview report={report.data} sheetRef={sheetRef} />
          ) : report.kind === "g8" ? (
            <G8ReportPreview report={report.data} sheetRef={sheetRef} />
          ) : report.kind === "g9" ? (
            <G9ReportPreview report={report.data} sheetRef={sheetRef} />
          ) : report.kind === "g10" ? (
            <G10ReportPreview report={report.data} sheetRef={sheetRef} />
          ) : (
            <G11ReportPreview report={report.data} sheetRef={sheetRef} />
          )}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[15px] font-semibold text-bosque">{label}</span>
      <div className="flex h-16 gap-1 rounded-xl border border-[#E0E0E0] bg-white p-2" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`px-4 rounded-lg text-[16px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F7BA8]/40 ${
              value === v ? "bg-[#C5EBF9] text-[#072249]" : "text-[#475569] hover:bg-[#F0F0F0]"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
