import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Gift, Pencil, Trash2, X } from "lucide-react";
import { useAdminLayout } from "@/lib/admin-layout-context";
import { todayISO } from "@/lib/dates";
import { deleteDonation, listDonations, listDonors, saveDonation } from "@/lib/donations.functions";
import { friendlyDonationError, nextDonationCode, type DonationRow, type DonorRow } from "@/lib/donations";
import { listGroups, type GroupRow } from "@/lib/groups.functions";
import { useSubmitLock } from "@/lib/submit-lock";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/admin/donaciones")({
  head: () => ({ meta: [{ title: "Donaciones — La Ollita" }] }),
  validateSearch: (search: Record<string, unknown>): { nuevo?: boolean } => ({
    nuevo: search.nuevo === true || search.nuevo === "true" || search.nuevo === "1" ? true : undefined,
  }),
  component: DonacionesPage,
});

const inputClass =
  "h-14 w-full border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]";

function shortDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function DonacionesPage() {
  const { nuevo } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/donaciones" });
  const { confirm, setSubtitleCount } = useAdminLayout();
  const fnList = useServerFn(listDonations);
  const fnDonors = useServerFn(listDonors);
  const fnGroups = useServerFn(listGroups);
  const fnSave = useServerFn(saveDonation);
  const fnDelete = useServerFn(deleteDonation);
  const { pending, run } = useSubmitLock();
  const [donations, setDonations] = useState<DonationRow[]>([]);
  const [donors, setDonors] = useState<DonorRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [editing, setEditing] = useState<DonationRow | "new" | null>(null);
  const [code, setCode] = useState("");
  const [donorId, setDonorId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayISO());

  const cargar = async () => {
    const [rows, donorRows, groupRows] = await Promise.all([fnList({}), fnDonors({}), fnGroups({})]);
    setDonations(rows);
    setDonors(donorRows);
    setGroups(groupRows);
    setSubtitleCount(rows.length);
    return rows;
  };

  useEffect(() => {
    cargar()
      .then((rows) => {
        if (nuevo) abrirNuevo(rows);
      })
      .catch((e: any) => void notifyError(friendlyDonationError(e?.message ?? "No pudimos cargar las donaciones.")));
  }, []);

  // The CTA in the header opens the form again while the page is already loaded.
  useEffect(() => {
    if (nuevo && donations.length > 0) abrirNuevo(donations);
  }, [nuevo]);

  const abrirNuevo = (rows: DonationRow[]) => {
    setEditing("new");
    setCode(nextDonationCode(rows.map((d) => d.code), Number(todayISO().slice(0, 4))));
    setDonorId("");
    setGroupId("");
    setReceivedOn(todayISO());
  };

  const abrirEditar = (d: DonationRow) => {
    setEditing(d);
    setCode(d.code);
    setDonorId(d.donorId);
    setGroupId(d.groupId);
    setReceivedOn(d.receivedOn);
    navigate({ search: {} });
  };

  const cerrarForm = () => {
    setEditing(null);
    navigate({ search: {} });
  };

  const guardar = () => {
    void run(async () => {
      try {
        await fnSave({
          data: { id: editing === "new" ? undefined : editing?.id, code, donorId, groupId, receivedOn },
        });
        void notifySuccess(editing === "new" ? "Se creó el lote." : "Se guardó el lote.");
        cerrarForm();
        await cargar();
      } catch (e: any) {
        void notifyError(friendlyDonationError(e?.message ?? "No pudimos guardar el lote."));
      }
    });
  };

  const borrar = (d: DonationRow) => {
    confirm({
      titulo: `¿Eliminar el lote ${d.code}?`,
      texto: "Las entradas que registraron los comedores se quedan en su almacén, pero ya no apuntan a este lote.",
      onConfirm: async () => {
        try {
          await fnDelete({ data: { id: d.id } });
          void notifySuccess("Se eliminó el lote.");
          await cargar();
        } catch (e: any) {
          void notifyError(friendlyDonationError(e?.message ?? "No pudimos eliminar el lote."));
        }
      },
    });
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {donations.length === 0 ? (
          <p className="text-[17px] text-[#718096] bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-5">
            Aún no hay lotes de donación. Crea uno y cada comedor del grupo registra su parte desde Almacén.
          </p>
        ) : (
          donations.map((d) => (
            <article key={d.id} className="bg-white border border-[#E0E0E0] rounded-[20px] px-5 py-[18px] flex items-start gap-4">
              <div className="size-[52px] rounded-[14px] bg-terracota-suave text-bosque grid place-items-center shrink-0">
                <Gift size={24} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <h3 className="text-[20px] font-bold text-[#072249] truncate">
                  {d.code} · {d.donorName}
                </h3>
                <p className="text-[16px] text-[#718096]">
                  {d.groupName} · llegó el {shortDate(d.receivedOn)} ·{" "}
                  {d.kitchens === 0
                    ? "ningún comedor registró su parte"
                    : d.kitchens === 1
                      ? "1 comedor registró su parte"
                      : `${d.kitchens} comedores registraron su parte`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => abrirEditar(d)}
                  className="size-12 rounded-full border border-[#E0E0E0] grid place-items-center text-[#475569] hover:border-[#0F7BA8]"
                  aria-label="Editar"
                >
                  <Pencil size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => borrar(d)}
                  className="size-12 rounded-full border border-[#E0E0E0] grid place-items-center text-[#C5352B] hover:border-[#C5352B]"
                  aria-label="Eliminar"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 bg-[rgba(7,34,73,0.55)] flex items-end sm:items-center justify-center p-4 sm:p-8" onClick={cerrarForm}>
          <div
            className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto bg-white rounded-[20px] p-7 flex flex-col gap-5 shadow-[0_12px_40px_rgba(7,34,73,0.30)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-2xl font-bold tracking-[-0.02em]">
                {editing === "new" ? "Nuevo lote de donación" : "Editar lote"}
              </h3>
              <button type="button" onClick={cerrarForm} className="size-11 rounded-full grid place-items-center text-[#475569]" aria-label="Cerrar">
                <X size={22} />
              </button>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[15px] font-semibold text-[#072249]">Código del lote</span>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="D-2026-044" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[15px] font-semibold text-[#072249]">Donante</span>
              <select value={donorId} onChange={(e) => setDonorId(e.target.value)} className={inputClass}>
                <option value="">{donors.length ? "Elige el donante" : "Primero crea un donante en Donantes"}</option>
                {donors.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[15px] font-semibold text-[#072249]">Grupo que la recibe</span>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={inputClass}>
                <option value="">Elige el grupo</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[15px] font-semibold text-[#072249]">Recibido por el grupo</span>
              <input type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} className={inputClass} />
            </label>
            <p className="text-[15px] text-[#718096]">
              Cada comedor registra lo que le tocó desde Almacén → Llegó o compré → Donación, eligiendo este lote.
            </p>
            <button
              type="button"
              disabled={pending}
              onClick={guardar}
              className="min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold disabled:opacity-60"
            >
              {pending ? (editing === "new" ? "Creando…" : "Guardando…") : editing === "new" ? "Crear lote" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
