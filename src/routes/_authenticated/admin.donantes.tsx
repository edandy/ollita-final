import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Pencil, Trash2, X } from "lucide-react";
import { useAdminLayout } from "@/lib/admin-layout-context";
import { deleteDonor, listDonors, saveDonor } from "@/lib/donations.functions";
import { friendlyDonationError, type DonorRow } from "@/lib/donations";
import { useSubmitLock } from "@/lib/submit-lock";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/admin/donantes")({
  head: () => ({ meta: [{ title: "Donantes — La Ollita" }] }),
  validateSearch: (search: Record<string, unknown>): { nuevo?: boolean } => ({
    nuevo: search.nuevo === true || search.nuevo === "true" || search.nuevo === "1" ? true : undefined,
  }),
  component: DonantesPage,
});

function DonantesPage() {
  const { nuevo } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/donantes" });
  const { confirm, setSubtitleCount } = useAdminLayout();
  const fnList = useServerFn(listDonors);
  const fnSave = useServerFn(saveDonor);
  const fnDelete = useServerFn(deleteDonor);
  const { pending, run } = useSubmitLock();
  const [donors, setDonors] = useState<DonorRow[]>([]);
  const [editing, setEditing] = useState<DonorRow | "new" | null>(nuevo ? "new" : null);
  const [name, setName] = useState("");

  const cargar = async () => {
    const rows = await fnList({});
    setDonors(rows);
    setSubtitleCount(rows.length);
  };

  useEffect(() => {
    cargar().catch((e: any) => void notifyError(friendlyDonationError(e?.message ?? "No pudimos cargar los donantes.")));
  }, []);

  useEffect(() => {
    if (nuevo) abrirNuevo();
  }, [nuevo]);

  const abrirNuevo = () => {
    setEditing("new");
    setName("");
  };

  const abrirEditar = (d: DonorRow) => {
    setEditing(d);
    setName(d.name);
    navigate({ search: {} });
  };

  const cerrarForm = () => {
    setEditing(null);
    navigate({ search: {} });
  };

  const guardar = () => {
    void run(async () => {
      try {
        await fnSave({ data: { id: editing === "new" ? undefined : editing?.id, name } });
        void notifySuccess(editing === "new" ? "Se creó el donante." : "Se guardó el donante.");
        cerrarForm();
        await cargar();
      } catch (e: any) {
        void notifyError(friendlyDonationError(e?.message ?? "No pudimos guardar el donante."));
      }
    });
  };

  const borrar = (d: DonorRow) => {
    confirm({
      titulo: `¿Eliminar ${d.name}?`,
      texto: d.donations
        ? "Este donante tiene lotes registrados. Elimina primero sus lotes."
        : "Se borra del catálogo de donantes.",
      onConfirm: async () => {
        try {
          await fnDelete({ data: { id: d.id } });
          void notifySuccess("Se eliminó el donante.");
          await cargar();
        } catch (e: any) {
          void notifyError(friendlyDonationError(e?.message ?? "No pudimos eliminar el donante."));
        }
      },
    });
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {donors.length === 0 ? (
          <p className="text-[17px] text-[#718096] bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-5">
            Aún no hay donantes. Crea uno para registrar sus lotes de donación.
          </p>
        ) : (
          donors.map((d) => (
            <article key={d.id} className="bg-white border border-[#E0E0E0] rounded-[20px] px-5 py-[18px] flex items-start gap-4">
              <div className="size-[52px] rounded-[14px] bg-terracota-suave text-bosque grid place-items-center shrink-0">
                <Building2 size={24} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <h3 className="text-[20px] font-bold text-[#072249] truncate">{d.name}</h3>
                <p className="text-[16px] text-[#718096]">
                  {d.donations === 0 ? "Sin lotes" : d.donations === 1 ? "1 lote" : `${d.donations} lotes`}
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
                {editing === "new" ? "Nuevo donante" : "Editar donante"}
              </h3>
              <button type="button" onClick={cerrarForm} className="size-11 rounded-full grid place-items-center text-[#475569]" aria-label="Cerrar">
                <X size={22} />
              </button>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[15px] font-semibold text-[#072249]">Nombre</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Alimentos Andinos S.A.C."
                className="h-14 w-full border border-[#E0E0E0] rounded-xl px-4 text-[17px] outline-none focus:border-[#0F7BA8]"
              />
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={guardar}
              className="min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold disabled:opacity-60"
            >
              {pending ? (editing === "new" ? "Creando…" : "Guardando…") : editing === "new" ? "Crear donante" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
