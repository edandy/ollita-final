import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { useSubmitLock } from "@/lib/submit-lock";
import { CARGO_LABEL, CARGOS_SOLO_LECTURA, type Cargo } from "@/lib/permisos";
import { asignarPersonalDesdePadron, eliminarPersonal, actualizarCargo } from "@/lib/personal.functions";
import {
  ASSIGNABLE_STAFF_CARGOS,
  friendlyAssignStaffError,
  validateAssignStaffFromPadron,
  type AssignableStaffCargo,
} from "@/lib/personal";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { notifyError, notifySuccess } from "@/lib/notify";
import { UserPlus, Trash2, Search } from "lucide-react";
import {
  PanelShell, PanelBack, PanelTitle, PanelCta, PanelField,
  PanelOverlay, panelInputClass,
} from "@/components/panel-ui";

export const Route = createFileRoute("/_authenticated/panel/personal")({
  head: () => ({ meta: [{ title: "Personal — La Ollita" }] }),
  component: PersonalPage,
});

type V = { id: string; user_id: string; nombre: string; cargo: Cargo; dni: string | null };

type Benef = {
  id: string;
  nombre_completo: string;
  dni: string;
  activo: boolean;
};

const CARGOS_ASIGNABLES: { key: AssignableStaffCargo; label: string }[] = ASSIGNABLE_STAFF_CARGOS.map((key) => ({
  key,
  label: CARGO_LABEL[key],
}));

function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[1]![0]!).toUpperCase();
}

function accesoTexto(v: V) {
  const dni = v.dni ? `DNI ${v.dni}` : "Sin DNI";
  if (v.cargo === "presidenta" || v.cargo === "vicepresidenta") return `${dni} · acceso total`;
  if (v.cargo === "tesorera") return `${dni} · caja y compras`;
  if (v.cargo === "almacenera") return `${dni} · inventario`;
  if (v.cargo === "cocinera") return `${dni} · menús`;
  if (CARGOS_SOLO_LECTURA.includes(v.cargo)) return `${dni} · solo visualizar`;
  return dni;
}

function chipCargo(cargo: Cargo) {
  if (cargo === "presidenta" || cargo === "vicepresidenta") {
    return "bg-[#C5EBF9] text-[#072249]";
  }
  return "bg-[#F0F0F0] text-[#475569]";
}

function PersonalPage() {
  const { comedor, vinculo, loading } = useMiComedor();
  const [lista, setLista] = useState<V[]>([]);
  const [agregando, setAgregando] = useState(false);
  const fnEliminar = useServerFn(eliminarPersonal);
  const fnCargo = useServerFn(actualizarCargo);

  const cargar = async () => {
    if (!comedor) return;
    const { data } = await supabase
      .from("usuarios_comedor")
      .select("id,user_id,nombre,cargo,dni")
      .eq("comedor_id", comedor.id)
      .order("nombre");
    setLista((data as V[]) ?? []);
  };
  useEffect(() => {
    cargar();
  }, [comedor?.id]);

  if (loading || !comedor) return null;
  const soyPresidenta = vinculo?.cargo === "presidenta" && !vinculo?.esSoloLectura;
  const equipo = lista.filter((v) => v.cargo !== "socia");

  const eliminar = async (v: V) => {
    if (
      !confirm(
        `¿Quitar el cargo de ${v.nombre}?\n\nSeguirá en el padrón y podrá entrar a ver el panel.`,
      )
    ) {
      return;
    }
    try {
      await fnEliminar({ data: { vinculo_id: v.id, comedor_id: comedor.id } });
      void notifySuccess(`Se quitó el cargo de ${v.nombre}.`);
      cargar();
    } catch (e: any) {
      void notifyError(friendlySupabaseError(e?.message ?? "Error"));
    }
  };

  const cambiar = async (v: V, cargo: Cargo) => {
    if (cargo === "presidenta") {
      void notifyError("Para transferir la presidencia, contacta al soporte.");
      return;
    }
    if (cargo === "socia") {
      await eliminar(v);
      return;
    }
    try {
      await fnCargo({ data: { vinculo_id: v.id, comedor_id: comedor.id, cargo: cargo as AssignableStaffCargo } });
      void notifySuccess("Guardamos los cambios.");
      cargar();
    } catch (e: any) {
      void notifyError(friendlySupabaseError(e?.message ?? "Error"));
    }
  };

  return (
    <PanelShell>
      <PanelBack />
      <PanelTitle
        title="Personal del comedor"
        subtitle="Elige a alguien del padrón y asígnale un cargo"
        action={
          soyPresidenta ? (
            <PanelCta onClick={() => setAgregando(true)} className="min-h-[52px] px-[22px] text-[16px] w-auto">
              <UserPlus size={22} strokeWidth={1.75} /> Asignar cargo
            </PanelCta>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        {!soyPresidenta && (
          <p className="text-[17px] text-[#718096]">
            Solo la presidenta puede asignar o cambiar el personal.
          </p>
        )}

        {equipo.map((v) => (
          <div
            key={v.id}
            className="bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-[18px] flex items-center gap-3.5 flex-wrap"
          >
            <div className="size-12 rounded-full bg-[#C5EBF9] text-[#072249] grid place-items-center text-[17px] font-bold shrink-0">
              {iniciales(v.nombre)}
            </div>
            <div className="flex-1 min-w-[140px] flex flex-col gap-0.5">
              <span className="text-[19px] font-bold text-[#072249] truncate leading-tight">
                {v.nombre}
              </span>
              <span className="text-[16px] text-[#718096]">{accesoTexto(v)}</span>
            </div>

            {soyPresidenta && v.cargo !== "presidenta" ? (
              <select
                value={v.cargo}
                onChange={(e) => cambiar(v, e.target.value as Cargo)}
                className={`text-[15px] font-bold px-3 py-[7px] rounded-md border-0 outline-none cursor-pointer ${chipCargo(v.cargo)}`}
                aria-label={`Cargo de ${v.nombre}`}
              >
                {CARGOS_ASIGNABLES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className={`text-[15px] font-bold px-3 py-[7px] rounded-md whitespace-nowrap ${chipCargo(v.cargo)}`}
              >
                {CARGO_LABEL[v.cargo]}
              </span>
            )}

            {soyPresidenta && v.cargo !== "presidenta" && (
              <button
                type="button"
                onClick={() => eliminar(v)}
                className="min-h-12 px-4 gap-1.5 inline-flex items-center rounded-full bg-[#FDECEA] text-[#C5352B] text-[16px] font-semibold shrink-0 hover:bg-[#F9D8D4]"
              >
                <Trash2 size={20} strokeWidth={1.75} /> Quitar
              </button>
            )}
          </div>
        ))}

        {equipo.length === 0 && (
          <p className="text-center text-[17px] text-[#718096] py-6">
            Elige a alguien del padrón y asígnale un cargo.
          </p>
        )}
      </div>

      {agregando && (
        <FormAsignar
          comedorId={comedor.id}
          ocupados={new Set(equipo.map((v) => v.dni).filter(Boolean) as string[])}
          cerrar={() => {
            setAgregando(false);
            cargar();
          }}
        />
      )}
    </PanelShell>
  );
}

function FormAsignar({
  comedorId,
  ocupados,
  cerrar,
}: {
  comedorId: string;
  ocupados: Set<string>;
  cerrar: () => void;
}) {
  const fn = useServerFn(asignarPersonalDesdePadron);
  const [padron, setPadron] = useState<Benef[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [elegida, setElegida] = useState<string>("");
  const [cargo, setCargo] = useState<AssignableStaffCargo>("tesorera");
  const [err, setErr] = useState<string | null>(null);
  const { pending: guardando, run } = useSubmitLock();

  useEffect(() => {
    void supabase
      .from("beneficiarios")
      .select("id,nombre_completo,dni,activo")
      .eq("comedor_id", comedorId)
      .eq("activo", true)
      .order("nombre_completo")
      .then(({ data }) => setPadron((data as Benef[]) ?? []));
  }, [comedorId]);

  const disponibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return padron.filter((b) => {
      if (ocupados.has(b.dni)) return false;
      if (!q) return true;
      return b.nombre_completo.toLowerCase().includes(q) || b.dni.includes(q);
    });
  }, [padron, ocupados, busqueda]);

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    let data;
    try {
      data = validateAssignStaffFromPadron({
        beneficiary_id: elegida,
        cargo,
        comedor_id: comedorId,
      });
    } catch (e: any) {
      setErr(e?.message ?? "Revisa los datos");
      return;
    }
    void run(async () => {
      try {
        await fn({
          data: {
            beneficiary_id: data.beneficiaryId,
            cargo: data.cargo,
            comedor_id: data.comedor_id,
          },
        });
        void notifySuccess("Se asignó el cargo.");
        cerrar();
      } catch (e: any) {
        setErr(friendlyAssignStaffError(e?.message ?? ""));
        void notifyError(friendlyAssignStaffError(e?.message ?? ""));
      }
    });
  };

  return (
    <PanelOverlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-[24px] font-bold tracking-[-0.02em] text-[#072249]">Asignar cargo</h3>
        <p className="text-[17px] text-[#475569]">Elige a alguien del padrón. Ya tiene cuenta para entrar.</p>
      </div>
      <form onSubmit={guardar} className="flex flex-col gap-[18px]">
        <PanelField label="Buscar en el padrón">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#718096]" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className={`${panelInputClass()} pl-12`}
              placeholder="Nombre o DNI"
              autoFocus
            />
          </div>
        </PanelField>

        <div className="max-h-56 overflow-y-auto flex flex-col gap-2">
          {disponibles.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setElegida(b.id)}
              className={`min-h-14 px-4 rounded-xl text-left border ${
                elegida === b.id
                  ? "border-[#0F7BA8] bg-[#C5EBF9]"
                  : "border-[#E0E0E0] bg-white"
              }`}
            >
              <span className="block text-[16px] font-semibold text-[#072249] truncate">{b.nombre_completo}</span>
              <span className="block text-[15px] text-[#718096]">DNI {b.dni}</span>
            </button>
          ))}
          {disponibles.length === 0 && (
            <p className="text-[16px] text-[#718096] py-3">
              No hay personas disponibles. Agrégalas primero en el padrón.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold text-[#072249]">Cargo</span>
          <div className="grid grid-cols-2 gap-2">
            {CARGOS_ASIGNABLES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCargo(c.key)}
                className={`min-h-14 px-3 rounded-xl text-[16px] font-semibold text-[#072249] border ${
                  cargo === c.key
                    ? "border-[#0F7BA8] bg-[#C5EBF9]"
                    : "border-[#E0E0E0] bg-white"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        {err && <p className="text-[15px] text-[#C5352B]">{err}</p>}
        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={cerrar}
            className="flex-1 min-h-14 rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[17px] font-semibold"
          >
            Cancelar
          </button>
          <PanelCta type="submit" loading={guardando} loadingText="Asignando…" className="flex-[1.4]">
            Asignar cargo
          </PanelCta>
        </div>
      </form>
    </PanelOverlay>
  );
}
