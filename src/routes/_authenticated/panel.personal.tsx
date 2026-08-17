import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { useSubmitLock } from "@/lib/submit-lock";
import { CARGO_LABEL, CARGOS_SOLO_LECTURA, type Cargo } from "@/lib/permisos";
import { crearPersonal, eliminarPersonal, actualizarCargo } from "@/lib/personal.functions";
import { crearInvitacion, listarInvitaciones, eliminarInvitacion } from "@/lib/invitaciones.functions";
import { EnlaceInvitacion } from "@/components/EnlaceInvitacion";
import { UserPlus, Link2, Trash2 } from "lucide-react";
import {
  PanelShell, PanelBack, PanelTitle, PanelCta, PanelField,
  PanelOverlay, panelInputClass,
} from "@/components/panel-ui";

export const Route = createFileRoute("/_authenticated/panel/personal")({
  head: () => ({ meta: [{ title: "Personal — La Ollita" }] }),
  component: PersonalPage,
});

type V = { id: string; user_id: string; nombre: string; cargo: Cargo; dni: string | null };

type CargoCreable =
  | "vicepresidenta"
  | "tesorera"
  | "almacenera"
  | "cocinera"
  | "secretaria"
  | "fiscal"
  | "vocal"
  | "socia";

const CARGOS_CREABLES: { key: CargoCreable; label: string }[] = [
  { key: "vicepresidenta", label: "Vicepresidenta" },
  { key: "tesorera", label: "Tesorera" },
  { key: "almacenera", label: "Almacenera" },
  { key: "cocinera", label: "Cocinera" },
  { key: "secretaria", label: "Secretaria" },
  { key: "fiscal", label: "Fiscal" },
  { key: "vocal", label: "Vocal" },
  { key: "socia", label: "Socia" },
];

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

  const eliminar = async (v: V) => {
    if (
      !confirm(
        `¿Quitar el acceso de ${v.nombre}?\n\nDejará de entrar al panel del comedor. Sigue en el padrón si estaba registrada.`,
      )
    ) {
      return;
    }
    try {
      await fnEliminar({ data: { vinculo_id: v.id, comedor_id: comedor.id } });
      cargar();
    } catch (e: any) {
      alert(e?.message ?? "Error");
    }
  };

  const cambiar = async (v: V, cargo: Cargo) => {
    if (cargo === "presidenta") {
      alert("Para transferir la presidencia, contacta al soporte.");
      return;
    }
    try {
      await fnCargo({ data: { vinculo_id: v.id, comedor_id: comedor.id, cargo } });
      cargar();
    } catch (e: any) {
      alert(e?.message ?? "Error");
    }
  };

  return (
    <PanelShell>
      <PanelBack />
      <PanelTitle
        title="Personal del comedor"
        subtitle="Cada cargo ve solo sus secciones"
        action={
          soyPresidenta ? (
            <PanelCta onClick={() => setAgregando(true)} className="min-h-[52px] px-[22px] text-[16px] w-auto">
              <UserPlus size={22} strokeWidth={1.75} /> Persona
            </PanelCta>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        {soyPresidenta && <Invitaciones comedorId={comedor.id} />}

        {!soyPresidenta && (
          <p className="text-[17px] text-[#718096]">
            Solo la presidenta puede agregar o cambiar el personal.
          </p>
        )}

        {lista.map((v) => (
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
                {CARGOS_CREABLES.map((c) => (
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

        {lista.length === 0 && (
          <p className="text-center text-[17px] text-[#718096] py-6">Aún no hay personal registrado.</p>
        )}
      </div>

      {agregando && (
        <FormPersonal
          comedorId={comedor.id}
          cerrar={() => {
            setAgregando(false);
            cargar();
          }}
        />
      )}
    </PanelShell>
  );
}

function Invitaciones({ comedorId }: { comedorId: string }) {
  const fnCrear = useServerFn(crearInvitacion);
  const fnListar = useServerFn(listarInvitaciones);
  const fnBorrar = useServerFn(eliminarInvitacion);
  const [cargo, setCargo] = useState<CargoCreable>("socia");
  const [lista, setLista] = useState<any[]>([]);
  const [nuevo, setNuevo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { pending, run } = useSubmitLock();

  const cargar = async () => {
    try {
      setLista((await fnListar({ data: { comedor_id: comedorId } })) as any[]);
    } catch {
      /* noop */
    }
  };
  useEffect(() => {
    cargar();
  }, [comedorId]);

  const generar = () => {
    setErr(null);
    void run(async () => {
      try {
        const inv: any = await fnCrear({ data: { comedor_id: comedorId, cargo } });
        setNuevo(`${window.location.origin}/invitacion/${inv.token}`);
        await cargar();
      } catch (e: any) {
        setErr(e?.message ?? "No se pudo generar el enlace");
      }
    });
  };

  return (
    <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        <Link2 size={26} className="text-[#0F7BA8] shrink-0" strokeWidth={1.75} />
        <span className="text-[19px] font-bold text-[#072249]">Invitar por enlace</span>
      </div>
      <p className="text-[17px] text-[#475569]">
        Genera un enlace y envíalo por WhatsApp. La persona crea su propia contraseña.
      </p>
      <div className="flex gap-2.5 flex-wrap">
        <select
          value={cargo}
          onChange={(e) => setCargo(e.target.value as CargoCreable)}
          className="flex-1 min-w-[200px] h-14 px-4 border border-[#E0E0E0] rounded-xl text-[17px] text-[#072249] outline-none focus:border-[#0F7BA8] bg-white"
        >
          {CARGOS_CREABLES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={generar}
          disabled={pending}
          className="min-h-14 px-[26px] rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold hover:bg-[#0A5F82] disabled:opacity-50"
        >
          {pending ? "Creando…" : "Generar"}
        </button>
      </div>
      {err && <p className="text-[15px] text-[#C5352B]">{err}</p>}
      {nuevo && <EnlaceInvitacion enlace={nuevo} />}
      {lista.filter((i) => !i.usado_at).length > 0 && (
        <div className="flex flex-col gap-2 pt-3 border-t border-[#F0F0F0]">
          <p className="text-[15px] font-semibold text-[#718096]">Enlaces pendientes</p>
          {lista
            .filter((i) => !i.usado_at)
            .map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 py-1">
                <span className="truncate text-[16px] text-[#072249]">
                  {CARGO_LABEL[i.cargo as Cargo]} · vence{" "}
                  {new Date(i.expira_at).toLocaleDateString("es-PE")}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await fnBorrar({ data: { id: i.id } });
                    cargar();
                  }}
                  className="size-11 grid place-items-center rounded-full bg-[#FDECEA] text-[#C5352B] shrink-0 hover:bg-[#F9D8D4]"
                  aria-label="Eliminar enlace"
                >
                  <Trash2 size={18} strokeWidth={1.75} />
                </button>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

function FormPersonal({ comedorId, cerrar }: { comedorId: string; cerrar: () => void }) {
  const fn = useServerFn(crearPersonal);
  const [nombre, setNombre] = useState("");
  const [dni, setDni] = useState("");
  const [pin, setPin] = useState("");
  const [telefono, setTelefono] = useState("");
  const [cargo, setCargo] = useState<CargoCreable>("socia");
  const [err, setErr] = useState<string | null>(null);
  const { pending: guardando, run } = useSubmitLock();

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    void run(async () => {
      try {
        await fn({
          data: {
            nombre: nombre.trim(),
            dni,
            pin,
            telefono,
            cargo,
            comedor_id: comedorId,
          },
        });
        cerrar();
      } catch (e: any) {
        setErr(e?.message ?? "No se pudo crear");
      }
    });
  };

  return (
    <PanelOverlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-[24px] font-bold tracking-[-0.02em] text-[#072249]">Agregar persona</h3>
        <p className="text-[17px] text-[#475569]">Entra con su DNI y el PIN que le des.</p>
      </div>
      <form onSubmit={guardar} className="flex flex-col gap-[18px]">
        <PanelField label="Nombre completo">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            className={panelInputClass()}
            placeholder="Ej. Rosa Huamán"
            autoFocus
          />
        </PanelField>
        <PanelField label="DNI (será su usuario)">
          <input
            inputMode="numeric"
            value={dni}
            onChange={(e) => setDni(e.target.value.replace(/\D/g, "").slice(0, 8))}
            required
            className={panelInputClass()}
            placeholder="8 números"
          />
        </PanelField>
        <PanelField
          label="PIN de acceso"
          note="Compártelo por WhatsApp. Ella puede cambiarlo después."
        >
          <input
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
            required
            className={panelInputClass()}
            placeholder="4 a 8 números"
          />
        </PanelField>
        <PanelField label="Celular · opcional">
          <input
            inputMode="numeric"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))}
            className={panelInputClass()}
            placeholder="987654321"
          />
        </PanelField>
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold text-[#072249]">Cargo</span>
          <div className="grid grid-cols-2 gap-2">
            {CARGOS_CREABLES.map((c) => (
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
          <button
            type="submit"
            disabled={guardando}
            className="flex-[1.4] min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-50"
          >
            {guardando ? "Creando…" : "Crear cuenta"}
          </button>
        </div>
      </form>
    </PanelOverlay>
  );
}
