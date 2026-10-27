import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { G1ReportPreview } from "@/components/admin/g1-report";
import { G2ReportPreview } from "@/components/admin/g2-report";
import { G3ReportPreview } from "@/components/admin/g3-report";
import { useAdminLayout } from "@/lib/admin-layout-context";
import { todayISO } from "@/lib/dates";
import { shiftWeek, weekRangeMonSat, type G1Report } from "@/lib/g1";
import { downloadG1Pdf, g1PdfFilename, g2PdfFilename, g3PdfFilename } from "@/lib/g1-pdf";
import { getG1Report, listReportGroups } from "@/lib/g1.functions";
import type { G2Report } from "@/lib/g2";
import { getG2Report } from "@/lib/g2.functions";
import { monthRange, shiftMonth, type G3Report } from "@/lib/g3";
import { getG3Report } from "@/lib/g3.functions";
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

const REPORT_KINDS = [
  { value: "g1", label: "G1 · Raciones del grupo" },
  { value: "g2", label: "G2 · Almacén del grupo" },
  { value: "g3", label: "G3 · Rendimiento de insumos del grupo" },
] as const;

type ReportKind = (typeof REPORT_KINDS)[number]["value"];

type LoadedReport =
  | { kind: "g1"; data: G1Report }
  | { kind: "g2"; data: G2Report }
  | { kind: "g3"; data: G3Report };

function ReportesPage() {
  const { isAdmin, setSubtitleCount } = useAdminLayout();
  const fnGroups = useServerFn(listReportGroups);
  const fnG1 = useServerFn(getG1Report);
  const fnG2 = useServerFn(getG2Report);
  const fnG3 = useServerFn(getG3Report);
  const [kind, setKind] = useState<ReportKind>("g1");
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState("");
  const [weekStart, setWeekStart] = useState(() => weekRangeMonSat(todayISO()).from);
  const [monthStart, setMonthStart] = useState(() => monthRange(todayISO()).from);
  const [report, setReport] = useState<LoadedReport | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const sheetRef = useRef<HTMLElement>(null);
  const { pending: exporting, run: runExport } = useSubmitLock();

  const week = weekRangeMonSat(weekStart);
  const monthly = kind === "g3";
  const periodLabel = monthly ? monthRange(monthStart).label : week.label;
  const shiftPeriod = (step: number) =>
    monthly ? setMonthStart((m) => shiftMonth(m, step)) : setWeekStart((w) => shiftWeek(w, step));

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
          : fnG3({ data: { groupId, monthStart } }).then((r) => ({
              report: { kind: "g3", data: r.report },
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
  }, [groupId, weekStart, monthStart, kind]);

  return (
    <div className="flex flex-col gap-5">
      <div className="g1-no-print flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1.5 min-w-[220px]">
          <span className="text-[15px] font-semibold text-bosque">Reporte</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ReportKind)}
            className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]"
          >
            {REPORT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 min-w-[220px] flex-1">
          <span className="text-[15px] font-semibold text-bosque">Grupo</span>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]"
          >
            {groups.length === 0 && <option value="">Sin grupos</option>}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[15px] font-semibold text-bosque">{monthly ? "Mes" : "Semana (lun–sáb)"}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftPeriod(-1)}
              className="size-14 rounded-xl border border-[#E0E0E0] bg-white grid place-items-center text-[#475569] hover:border-[#0F7BA8]"
              aria-label={monthly ? "Mes anterior" : "Semana anterior"}
            >
              <ChevronLeft size={22} />
            </button>
            <span className="min-w-[168px] text-center text-[17px] font-semibold text-[#072249]">{periodLabel}</span>
            <button
              type="button"
              onClick={() => shiftPeriod(1)}
              className="size-14 rounded-xl border border-[#E0E0E0] bg-white grid place-items-center text-[#475569] hover:border-[#0F7BA8]"
              aria-label={monthly ? "Mes siguiente" : "Semana siguiente"}
            >
              <ChevronRight size={22} />
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
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
                      : g3PdfFilename(report.data.groupName, report.data.month.from);
                await downloadG1Pdf(sheet, filename);
              } catch (err) {
                console.error(err);
                void notifyError("No pudimos generar el PDF. Inténtalo de nuevo.");
              }
            });
          }}
          disabled={!report || exporting}
          className="min-h-14 px-6 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold inline-flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60 sm:ml-auto"
        >
          <Printer size={20} /> {exporting ? "Generando…" : "Exportar PDF"}
        </button>
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
          ) : (
            <G3ReportPreview report={report.data} sheetRef={sheetRef} />
          )}
        </div>
      )}
    </div>
  );
}
