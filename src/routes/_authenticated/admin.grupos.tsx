import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Layers, Pencil, Trash2, X } from "lucide-react";
import { useAdminLayout } from "@/lib/admin-layout-context";
import { createGroup, deleteGroup, listGroups, updateGroup, type GroupRow } from "@/lib/groups.functions";
import { friendlyGroupError } from "@/lib/groups";
import { useSubmitLock } from "@/lib/submit-lock";
import { notifyError, notifySuccess } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/admin/grupos")({
  head: () => ({ meta: [{ title: "Grupos — La Ollita" }] }),
  validateSearch: (search: Record<string, unknown>): { nuevo?: boolean } => ({
    nuevo: search.nuevo === true || search.nuevo === "true" || search.nuevo === "1" ? true : undefined,
  }),
  component: GruposPage,
});

function GruposPage() {
  const { nuevo } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/grupos" });
  const { kitchens, confirm, setSubtitleCount } = useAdminLayout();
  const fnList = useServerFn(listGroups);
  const fnCreate = useServerFn(createGroup);
  const fnUpdate = useServerFn(updateGroup);
  const fnDelete = useServerFn(deleteGroup);
  const { pending, run } = useSubmitLock();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [editing, setEditing] = useState<GroupRow | "new" | null>(nuevo ? "new" : null);
  const [name, setName] = useState("");
  const [kitchenIds, setKitchenIds] = useState<string[]>([]);

  const cargar = async () => {
    const rows = await fnList({});
    setGroups(rows);
    setSubtitleCount(rows.length);
  };

  useEffect(() => {
    cargar().catch((e: any) => void notifyError(friendlyGroupError(e?.message ?? "No pudimos cargar los grupos.")));
  }, []);

  useEffect(() => {
    if (nuevo) abrirNuevo();
  }, [nuevo]);

  const abrirNuevo = () => {
    setEditing("new");
    setName("");
    setKitchenIds([]);
  };

  const abrirEditar = (g: GroupRow) => {
    setEditing(g);
    setName(g.name);
    setKitchenIds(g.kitchenIds);
    navigate({ search: {} });
  };

  const cerrarForm = () => {
    setEditing(null);
    navigate({ search: {} });
  };

  const guardar = () => {
    void run(async () => {
      try {
        if (editing === "new") {
          await fnCreate({ data: { name, kitchenIds } });
          void notifySuccess("Se creó el grupo.");
        } else if (editing) {
          await fnUpdate({ data: { id: editing.id, name, kitchenIds } });
          void notifySuccess("Se guardó el grupo.");
        }
        cerrarForm();
        await cargar();
      } catch (e: any) {
        void notifyError(friendlyGroupError(e?.message ?? "No pudimos guardar el grupo."));
      }
    });
  };

  const borrar = (g: GroupRow) => {
    confirm({
      titulo: `¿Eliminar ${g.name}?`,
      texto: "Las ollas no se borran, solo dejan de pertenecer a este grupo.",
      onConfirm: async () => {
        await fnDelete({ data: { id: g.id } });
        void notifySuccess("Se eliminó el grupo.");
        await cargar();
      },
    });
  };

  const toggleKitchen = (id: string) => {
    setKitchenIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const nombrePorId = Object.fromEntries(kitchens.map((k) => [k.id, k.nombre]));

  return (
    <>
      <div className="flex flex-col gap-4">
        {groups.length === 0 ? (
          <p className="text-[17px] text-[#718096] bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-5">
            Aún no hay grupos. Crea uno para agrupar ollas en los reportes.
          </p>
        ) : (
          groups.map((g) => (
            <article key={g.id} className="bg-white border border-[#E0E0E0] rounded-[20px] px-5 py-[18px] flex items-start gap-4">
              <div className="size-[52px] rounded-[14px] bg-terracota-suave text-bosque grid place-items-center shrink-0">
                <Layers size={24} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <h3 className="text-[20px] font-bold text-[#072249] truncate">{g.name}</h3>
                <p className="text-[16px] text-[#718096]">
                  {g.kitchenIds.length === 0
                    ? "Sin ollas"
                    : `${g.kitchenIds.length} olla${g.kitchenIds.length === 1 ? "" : "s"} · ${g.kitchenIds.map((id) => nombrePorId[id] ?? "Olla").join(", ")}`}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => abrirEditar(g)}
                  className="size-12 rounded-full border border-[#E0E0E0] grid place-items-center text-[#475569] hover:border-[#0F7BA8]"
                  aria-label="Editar"
                >
                  <Pencil size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => borrar(g)}
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
                {editing === "new" ? "Nuevo grupo" : "Editar grupo"}
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
                placeholder="Ej. VES Sur"
                className="h-14 w-full border border-[#E0E0E0] rounded-xl px-4 text-[17px] outline-none focus:border-[#0F7BA8]"
              />
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-[15px] font-semibold text-[#072249]">Ollas del grupo</span>
              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
                {kitchens.map((k) => {
                  const on = kitchenIds.includes(k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKitchen(k.id)}
                      className={`min-h-14 px-4 rounded-xl border text-left text-[17px] font-semibold ${
                        on ? "border-[#0F7BA8] bg-[#C5EBF9] text-[#072249]" : "border-[#E0E0E0] bg-white text-[#475569]"
                      }`}
                    >
                      {k.nombre}
                      <span className="block text-[14px] font-normal text-[#718096]">{k.distrito}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={guardar}
              className="min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold disabled:opacity-60"
            >
              {pending ? (editing === "new" ? "Creando…" : "Guardando…") : editing === "new" ? "Crear grupo" : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
