import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  adminActivarComedor, adminCrearComedor, adminEliminarComedor,
  adminCrearInvitacion, adminListarUsuarios, adminCrearUsuario, adminCambiarCargo, adminEliminarUsuario,
  adminActualizarComedor, adminCrearEnlaceRegistro, adminActividadDiaria,
} from "@/lib/admin.functions";
import {
  listPlatformUsers, createPlatformUser, updatePlatformUser, deletePlatformUser,
} from "@/lib/supervisor.functions";
import { SUPERVISOR_KITCHEN_STORAGE_KEY, type AccessLevel } from "@/lib/access";
import { needsSupervisorFields, friendlyCreatePlatformUserError, type PlatformRole } from "@/lib/supervisor";
import { useSubmitLock } from "@/lib/submit-lock";
import { EnlaceInvitacion } from "@/components/EnlaceInvitacion";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Power, Trash2, Link2, Users, Utensils, ClipboardList, X,
  Pencil, ArrowRight, Check, Minus, Search, MoreVertical, ChevronDown,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  useAdminLayout,
  type AdminConfirm,
  type KitchenRow,
} from "@/lib/admin-layout-context";

const CARGOS = ["presidenta", "vicepresidenta", "tesorera", "almacenera", "cocinera", "secretaria", "fiscal", "vocal", "socia"] as const;

type Fila = KitchenRow;
type Confirmacion = AdminConfirm;

export function kitchenTotals(kitchens: KitchenRow[]) {
  return {
    comedores: kitchens.length,
    activos: kitchens.filter((f) => f.activo).length,
    socias: kitchens.reduce((a, f) => a + f.socias, 0),
    beneficiarios: kitchens.reduce((a, f) => a + f.beneficiarios, 0),
  };
}

export function KitchensPanel() {
  const { isAdmin, isSupervisor, accessLevel, kitchens, reloadKitchens, confirm } = useAdminLayout();
  const fnActivar = useServerFn(adminActivarComedor);
  const fnEliminar = useServerFn(adminEliminarComedor);
  const [invitando, setInvitando] = useState<Fila | null>(null);
  const [editando, setEditando] = useState<Fila | null>(null);
  const [menuCard, setMenuCard] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const cerrar = () => setMenuCard(null);
    if (menuCard) {
      window.addEventListener("click", cerrar);
      return () => window.removeEventListener("click", cerrar);
    }
  }, [menuCard]);

  const lista = kitchens.filter((f) =>
    (f.nombre + " " + f.distrito + " " + f.tipo).toLowerCase().includes(q.trim().toLowerCase()));
  const totales = kitchenTotals(kitchens);

  const tipoLabel = (t: string) =>
    t === "olla" ? "Olla común" : t === "restaurante" ? "Negocio de menú" : "Comedor popular";

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <Kpi icon={Utensils} valor={totales.comedores} label="Ollas y comedores" />
          <Kpi icon={Power} valor={totales.activos} label="Activos hoy" />
          <Kpi icon={Users} valor={totales.socias} label="Socias con acceso" />
          <Kpi icon={ClipboardList} valor={totales.beneficiarios} label="Beneficiarios en padrón" />
        </div>

        <div className="h-14 max-w-[520px] bg-white border border-[#E0E0E0] rounded-xl px-[18px] flex items-center gap-2.5">
          <Search size={20} className="text-[#718096] shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o distrito"
            className="flex-1 border-0 outline-none bg-transparent text-[17px] text-[#111] min-w-0"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {lista.map((f) => (
            <article key={f.id} className="bg-white border border-[#E0E0E0] rounded-[20px] overflow-hidden flex flex-col relative">
              <div className={`h-1.5 ${f.activo ? "bg-[#20A5E0]" : "bg-[#E0E0E0]"}`} />
              <div className="px-[22px] pt-5 pb-[18px] flex flex-col gap-3.5">
                <div className="flex items-start justify-between gap-3">
                  <span className={`inline-flex items-center gap-2 text-[15px] font-bold px-3.5 py-1.5 rounded-full ${
                    f.activo ? "bg-terracota-suave text-[#0A5F82]" : "bg-[#F0F0F0] text-[#718096]"
                  }`}>
                    <span className={`size-2 rounded-full ${f.activo ? "bg-[#20A5E0]" : "bg-[#9197B3]"}`} />
                    {f.activo ? "Activo" : "Inactivo"}
                  </span>
                  {isAdmin && (
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      title="Más opciones"
                      onClick={() => setMenuCard(menuCard === f.id ? null : f.id)}
                      className="size-11 -mt-2 -mr-2 rounded-full text-[#718096] hover:bg-[#F0F0F0] grid place-items-center"
                    >
                      <MoreVertical size={20} />
                    </button>
                    {menuCard === f.id && (
                      <div className="absolute top-12 right-0 w-[230px] bg-white border border-[#E0E0E0] rounded-[14px] p-2 flex flex-col gap-0.5 shadow-[0_8px_24px_rgba(7,34,73,0.18)] z-10">
                        <MenuItem icon={Pencil} label="Editar datos" onClick={() => { setMenuCard(null); setEditando(f); }} />
                        <MenuItem icon={Link2} label="Invitar a una socia" onClick={() => { setMenuCard(null); setInvitando(f); }} />
                        <MenuItem
                          icon={Power}
                          label={f.activo ? "Desactivar" : "Reactivar"}
                          onClick={async () => {
                            setMenuCard(null);
                            await fnActivar({ data: { comedor_id: f.id, activo: !f.activo } });
                            reloadKitchens();
                          }}
                        />
                        <span className="h-px bg-[#F0F0F0] mx-2 my-1" />
                        <MenuItem
                          icon={Trash2}
                          label="Eliminar"
                          danger
                          onClick={() => {
                            setMenuCard(null);
                            confirm({
                              titulo: `¿Eliminar ${f.nombre}?`,
                              texto: "Se borran su padrón, su caja y su historial de menús. Esta acción no se puede deshacer.",
                              onConfirm: async () => {
                                await fnEliminar({ data: { comedor_id: f.id } });
                                await reloadKitchens();
                              },
                            });
                          }}
                        />
                      </div>
                    )}
                  </div>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[22px] font-bold tracking-[-0.01em] leading-tight">{f.nombre}</span>
                  <span className="text-base text-[#718096]">{tipoLabel(f.tipo)} · {f.distrito}</span>
                </div>
              </div>
              <div className="border-t border-[#F0F0F0] px-[22px] py-[18px] flex flex-col gap-3">
                <DatoFila label="Reservas registradas" valor={`${f.reservas} ${f.reservas === 1 ? "reserva" : "reservas"}`} />
                <DatoFila label="Socias · padrón" valor={`${f.socias} · ${f.beneficiarios}`} />
                <DatoFila label="Dirección" valor={f.direccion || "—"} />
                <button
                  type="button"
                  onClick={() => {
                    if (isAdmin) window.localStorage.setItem("admin_comedor_id", f.id);
                    else window.localStorage.setItem(SUPERVISOR_KITCHEN_STORAGE_KEY, f.id);
                    window.location.href = "/panel";
                  }}
                  className={`min-h-[58px] mt-1.5 gap-2.5 flex items-center justify-center rounded-xl text-lg font-semibold border ${
                    f.activo
                      ? "border-[#0F7BA8] text-[#0F7BA8] bg-white hover:bg-terracota-suave"
                      : "border-[#E0E0E0] text-[#718096] bg-white"
                  }`}
                >
                  {isSupervisor && !isAdmin && accessLevel === "view" ? "Ver olla" : "Entrar al panel"} <ArrowRight size={20} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {lista.length === 0 && (
          <p className="text-center text-[#718096] py-10">No hay comedores que coincidan.</p>
        )}
      </div>
      {invitando && <ModalInvitar comedor={invitando} cerrar={() => setInvitando(null)} />}
      {editando && <ModalEditar comedor={editando} cerrar={() => setEditando(null)} recargar={reloadKitchens} />}
    </>
  );
}

function MenuItem({
  icon: Icon, label, onClick, danger,
}: { icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 px-3 gap-3 flex items-center rounded-[10px] text-left text-base font-semibold hover:bg-[#F0F0F0] ${
        danger ? "text-[#C5352B] hover:bg-[#FDECEA]" : "text-bosque"
      }`}
    >
      <Icon size={20} className={danger ? "" : "text-[#718096]"} />
      {label}
    </button>
  );
}

function DatoFila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[17px] text-[#718096]">{label}</span>
      <span className="text-lg font-bold text-bosque text-right">{valor}</span>
    </div>
  );
}

function Kpi({ label, valor, icon: Icon }: { label: string; valor: number; icon: typeof Utensils }) {
  return (
    <div className="bg-white border border-[#E0E0E0] rounded-[18px] p-5 flex items-center gap-4">
      <div className="size-[52px] rounded-[14px] bg-terracota-suave text-bosque grid place-items-center shrink-0">
        <Icon size={26} />
      </div>
      <div className="flex flex-col">
        <span className="text-[30px] font-bold tracking-[-0.02em] leading-none">{valor}</span>
        <span className="text-base text-[#718096] mt-1">{label}</span>
      </div>
    </div>
  );
}

function Campo({ label, className, ...rest }: any) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[15px] font-semibold text-bosque">{label}</span>
      <input {...rest} className={`h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] outline-none focus:border-[#0F7BA8] ${className ?? ""}`} />
    </label>
  );
}

function SelectCargo({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[15px] font-semibold text-bosque">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]">
        {CARGOS.map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
      </select>
    </label>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-[rgba(7,34,73,0.55)] z-50 flex items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div
        className="w-full max-w-[520px] max-h-full overflow-y-auto bg-white rounded-[20px] p-7 flex flex-col gap-5 shadow-[0_12px_40px_rgba(7,34,73,0.30)]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function KitchenMultiSelect({
  kitchens,
  selectedIds,
  onChange,
}: {
  kitchens: { id: string; nombre: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = kitchens.filter((k) => selectedIds.includes(k.id));
  const triggerLabel =
    selected.length === 0
      ? "Elige una o más ollas…"
      : selected.length === 1
        ? selected[0]!.nombre
        : `${selected.length} ollas seleccionadas`;

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[15px] font-semibold">Ollas asignadas</span>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-14 w-full border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none flex items-center justify-between gap-2 text-left hover:border-[#0F7BA8] data-[state=open]:border-[#0F7BA8]"
          >
            <span className={`truncate ${selected.length ? "text-bosque" : "text-[#718096]"}`}>{triggerLabel}</span>
            <ChevronDown size={20} className="text-[#718096] shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="z-[80] w-[var(--radix-popover-trigger-width)] p-0 rounded-xl border border-[#E0E0E0] bg-white shadow-[0_8px_24px_rgba(7,34,73,0.18)]"
          onWheel={(e) => e.stopPropagation()}
        >
          <Command className="rounded-xl">
            <CommandInput placeholder="Buscar olla o comedor…" className="h-12 text-[16px]" />
            <CommandList className="max-h-56">
              <CommandEmpty className="py-6 text-[15px] text-[#718096]">No hay ollas que coincidan.</CommandEmpty>
              <CommandGroup>
                {kitchens.map((k) => {
                  const on = selectedIds.includes(k.id);
                  return (
                    <CommandItem
                      key={k.id}
                      value={k.nombre}
                      onSelect={() => toggle(k.id)}
                      className="min-h-11 rounded-[10px] px-3 text-[16px] text-bosque data-[selected=true]:bg-terracota-suave data-[selected=true]:text-bosque"
                    >
                      <span className={`size-5 rounded-md border grid place-items-center shrink-0 ${
                        on ? "bg-[#0F7BA8] border-[#0F7BA8] text-white" : "border-[#C5C5C5] bg-white"
                      }`}>
                        {on && <Check size={14} strokeWidth={3} />}
                      </span>
                      <span className="truncate">{k.nombre}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => toggle(k.id)}
              className="max-w-full inline-flex items-center gap-1 rounded-full bg-terracota-suave text-[#0A5F82] text-[14px] font-semibold pl-3 pr-2 py-1.5"
            >
              <span className="truncate">{k.nombre}</span>
              <X size={14} strokeWidth={2.5} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormDrawer({
  open, onOpenChange, title, description, children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 bg-white p-0 border-[#E0E0E0] sm:max-w-[460px] [&>button]:right-5 [&>button]:top-5 [&>button]:size-11 [&>button]:inline-flex [&>button]:items-center [&>button]:justify-center [&>button]:rounded-full [&>button]:bg-[#F0F0F0] [&>button]:opacity-100 [&>button]:hover:bg-[#E8E8E8] [&>button]:focus:ring-[#0F7BA8]"
      >
        <SheetHeader className="gap-1.5 border-b border-[#F0F0F0] px-7 pb-5 pt-7 pr-16 text-left">
          <SheetTitle className="text-[26px] font-bold tracking-[-0.02em] text-bosque leading-tight">{title}</SheetTitle>
          <SheetDescription className="text-base text-[#475569] leading-snug">{description}</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-7 py-6">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ModalConfirmacion({
  titulo, texto, cerrar, confirmar,
}: { titulo: string; texto: string; cerrar: () => void; confirmar: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 bg-[rgba(7,34,73,0.55)] z-50 flex items-center justify-center p-4 sm:p-8" onClick={cerrar}>
      <div className="w-full max-w-[460px] bg-white rounded-[20px] p-7 flex flex-col gap-5 shadow-[0_12px_40px_rgba(7,34,73,0.30)]" onClick={(e) => e.stopPropagation()}>
        <div className="size-14 rounded-full bg-[#FDECEA] text-[#C5352B] grid place-items-center">
          <Trash2 size={28} />
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-2xl font-bold tracking-[-0.02em]">{titulo}</h3>
          <p className="text-[17px] text-[#475569]">{texto}</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={cerrar} className="flex-1 min-h-14 rounded-full border border-[#E0E0E0] bg-white text-bosque text-[17px] font-semibold hover:border-[#9197B3]">
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await confirmar(); } finally { setBusy(false); } }}
            className="flex-1 min-h-14 rounded-full bg-[#C5352B] text-white text-[17px] font-semibold hover:bg-[#A82A22] disabled:opacity-60"
          >
            {busy ? "Eliminando…" : "Sí, eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

type ActFila = {
  id: string; nombre: string; distrito: string; activo: boolean;
  celdas: { menus: number; reservas: number; ingresos: number }[];
};

export function PanelActividad({ dias, setDias }: { dias: number; setDias: (n: number) => void }) {
  const fn = useServerFn(adminActividadDiaria);
  const [data, setData] = useState<{ dias: string[]; filas: ActFila[] } | null>(null);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    fn({ data: { dias } }).then((r: any) => setData(r)).finally(() => setCargando(false));
  }, [dias]);

  const filas = (data?.filas ?? []).filter((f) =>
    (f.nombre + " " + f.distrito).toLowerCase().includes(q.trim().toLowerCase()));

  const etiqueta = (f: string) => {
    const [, m, d] = f.split("-");
    return `${d}/${m}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-base text-[#475569]">
          Cada columna es un día. El check marca que publicó menú; el número, las reservas de ese día.
        </p>
        <div className="flex gap-1 bg-white border border-[#E0E0E0] rounded-full p-1">
          {[7, 14, 30].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setDias(r)}
              className={`min-h-12 px-[18px] rounded-full text-base font-semibold ${
                dias === r ? "bg-terracota-suave text-bosque" : "text-[#718096]"
              }`}
            >
              {r} días
            </button>
          ))}
        </div>
      </div>

      <div className="h-14 max-w-[520px] bg-white border border-[#E0E0E0] rounded-xl px-[18px] flex items-center gap-2.5">
        <Search size={20} className="text-[#718096] shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar olla o comedor"
          className="flex-1 border-0 outline-none bg-transparent text-[17px] text-[#111] min-w-0"
        />
      </div>

      {cargando && !data ? (
        <p className="text-center text-[#718096] py-10">Cargando…</p>
      ) : (
        <div className="bg-white border border-[#E0E0E0] rounded-[20px] overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[640px]">
            <thead>
              <tr className="bg-bosque text-white">
                <th className="text-left px-6 py-4 sticky left-0 bg-bosque z-10 min-w-[200px] text-[15px] font-bold">Olla / comedor</th>
                {(data?.dias ?? []).map((d) => (
                  <th key={d} className="px-0 py-4 text-[15px] font-semibold text-bosque-suave text-center whitespace-nowrap w-[60px]">{etiqueta(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const conMenu = f.celdas.filter((c) => c.menus > 0).length;
                return (
                  <tr key={f.id} className="border-b border-[#F0F0F0]">
                    <td className="px-6 py-4 sticky left-0 bg-white z-10">
                      <p className="text-[17px] font-bold text-bosque truncate max-w-[240px]">{f.nombre}</p>
                      <p className="text-[15px] text-[#718096]">
                        {conMenu} de {f.celdas.length} días con menú
                      </p>
                    </td>
                    {f.celdas.map((c, i) => (
                      <td key={i} className="py-3.5 text-center align-middle">
                        {c.menus > 0 ? (
                          <Check size={22} className="mx-auto text-[#248341]" />
                        ) : (
                          <Minus size={22} className="mx-auto text-[#E0E0E0]" />
                        )}
                        <div className="text-sm text-[#718096] mt-0.5">{c.menus > 0 ? c.reservas : ""}</div>
                      </td>
                    ))}
                  </tr>
                );
              })}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={(data?.dias.length ?? 0) + 1} className="text-center text-[#718096] py-10">Sin registros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModalEditar({ comedor, cerrar, recargar }: { comedor: Fila; cerrar: () => void; recargar: () => void }) {
  const fn = useServerFn(adminActualizarComedor);
  const [v, setV] = useState({
    nombre: comedor.nombre,
    tipo: comedor.tipo,
    distrito: comedor.distrito,
    direccion: comedor.direccion,
    precio_menu: String(comedor.precio_menu ?? 0),
    raciones_diarias: String(comedor.raciones_diarias ?? 0),
    telefono_whatsapp: comedor.telefono_whatsapp ?? "",
    yape_numero: comedor.yape_numero ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const { pending: guardando, run } = useSubmitLock();

  const tipos = [
    { key: "comedor", label: "Comedor popular", sub: "Reconocido por el MIDIS" },
    { key: "olla", label: "Olla común", sub: "Autogestionada por el barrio" },
    { key: "restaurante", label: "Negocio de menú", sub: "Venta particular, sin apoyo del Estado" },
  ];

  return (
    <Overlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-2xl font-bold tracking-[-0.02em]">Datos de {comedor.nombre}</h3>
        <p className="text-base text-[#475569]">El precio del menú, las raciones y los pagos los maneja el comedor desde su panel.</p>
      </div>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          void run(async () => {
            try {
              await fn({
                data: {
                  comedor_id: comedor.id,
                  nombre: v.nombre,
                  tipo: v.tipo,
                  distrito: v.distrito,
                  direccion: v.direccion,
                  precio_menu: Number(v.precio_menu) || 0,
                  raciones_diarias: Number(v.raciones_diarias) || 0,
                  telefono_whatsapp: v.telefono_whatsapp,
                  yape_numero: v.yape_numero,
                },
              });
              recargar();
              cerrar();
            } catch (e: any) {
              setErr(e?.message ?? "No se pudo guardar");
            }
          });
        }}
      >
        <Campo label="Nombre" value={v.nombre} onChange={(e: any) => setV({ ...v, nombre: e.target.value })} required />
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold text-bosque">Tipo</span>
          {tipos.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setV({ ...v, tipo: t.key })}
              className={`min-h-16 px-4 py-3 rounded-xl text-left flex flex-col gap-0.5 border ${
                v.tipo === t.key ? "border-[#0F7BA8] bg-terracota-suave" : "border-[#E0E0E0] bg-white"
              }`}
            >
              <span className="text-[17px] font-semibold">{t.label}</span>
              <span className="text-[15px] text-[#475569]">{t.sub}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Campo label="Distrito" value={v.distrito} onChange={(e: any) => setV({ ...v, distrito: e.target.value })} />
          <Campo label="Dirección" value={v.direccion} onChange={(e: any) => setV({ ...v, direccion: e.target.value })} />
        </div>
        {err && <p className="text-[#C5352B] text-sm">{err}</p>}
        <div className="flex gap-3 mt-1">
          <button type="button" onClick={cerrar} className="flex-1 min-h-14 rounded-full border border-[#E0E0E0] bg-white text-bosque text-[17px] font-semibold">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="flex-[1.4] min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

export function PanelNueva({ comedores, recargar, verOllas }: { comedores: Fila[]; recargar: () => void; verOllas: () => void }) {
  const fnCrear = useServerFn(adminCrearComedor);
  const fnInv = useServerFn(adminCrearInvitacion);
  const fnRegistro = useServerFn(adminCrearEnlaceRegistro);
  const [v, setV] = useState({ nombre: "", distrito: "", direccion: "", presidenta: "", dni: "", pin: "", telefono: "" });
  const [modo, setModo] = useState<"enlace" | "cuenta">("enlace");
  const [cargo, setCargo] = useState<string>("presidenta");
  const [err, setErr] = useState<string | null>(null);
  const { pending: guardando, run } = useSubmitLock();
  const [enlace, setEnlace] = useState<string | null>(null);
  const [creado, setCreado] = useState<string | null>(null);
  const [existente, setExistente] = useState("");
  const [enlace2, setEnlace2] = useState<string | null>(null);
  const [cargo2, setCargo2] = useState<string>("presidenta");
  const [enlaceRegistro, setEnlaceRegistro] = useState<string | null>(null);
  const [generandoReg, setGenerandoReg] = useState(false);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <div className="bg-white border border-[#E0E0E0] rounded-[20px] p-[26px] flex flex-col gap-5">
        <h3 className="text-[22px] font-bold">Nueva olla o comedor</h3>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            void run(async () => {
              try {
                const r: any = await fnCrear({ data: { ...v, con_cuenta: modo === "cuenta" } });
                setCreado(r.nombre ?? v.nombre);
                recargar();
                if (modo === "enlace") {
                  const inv: any = await fnInv({ data: { comedor_id: r.comedor_id, cargo: cargo as any } });
                  setEnlace(`${window.location.origin}/invitacion/${inv.token}`);
                }
                setV({ nombre: "", distrito: "", direccion: "", presidenta: "", dni: "", pin: "", telefono: "" });
              } catch (e: any) {
                setErr(e?.message ?? "No se pudo crear");
              }
            });
          }}
        >
          <Campo label="Nombre del comedor" value={v.nombre} onChange={(e: any) => setV({ ...v, nombre: e.target.value })} placeholder="Ej. Comedor Santa Rosa" required />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Distrito" value={v.distrito} onChange={(e: any) => setV({ ...v, distrito: e.target.value })} placeholder="Cercado de Lima" />
            <Campo label="Dirección" value={v.direccion} onChange={(e: any) => setV({ ...v, direccion: e.target.value })} placeholder="Av. Los Álamos 240" />
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[15px] font-semibold">¿Cómo entrará la presidenta?</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { key: "enlace" as const, label: "Con enlace de invitación", sub: "Ella crea su acceso" },
                { key: "cuenta" as const, label: "Crear su cuenta ahora", sub: "Tú defines su DNI y PIN" },
              ]).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setModo(m.key)}
                  className={`min-h-[76px] px-[18px] py-3.5 rounded-[14px] text-left flex flex-col gap-0.5 border ${
                    modo === m.key ? "border-[#0F7BA8] bg-terracota-suave" : "border-[#E0E0E0] bg-white"
                  }`}
                >
                  <span className="text-[17px] font-semibold">{m.label}</span>
                  <span className="text-[15px] opacity-80">{m.sub}</span>
                </button>
              ))}
            </div>
          </div>

          {modo === "enlace" ? (
            <SelectCargo value={cargo} onChange={setCargo} label="Cargo del enlace" />
          ) : (
            <>
              <Campo label="Nombre de la presidenta" value={v.presidenta} onChange={(e: any) => setV({ ...v, presidenta: e.target.value })} placeholder="Ej. María Quispe" required />
              <Campo label="DNI (será su usuario)" value={v.dni} onChange={(e: any) => setV({ ...v, dni: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="12345678" required />
              <Campo label="PIN de acceso (4 a 8 números)" value={v.pin} onChange={(e: any) => setV({ ...v, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} placeholder="1234" required />
              <Campo label="Celular · opcional" value={v.telefono} onChange={(e: any) => setV({ ...v, telefono: e.target.value.replace(/\D/g, "").slice(0, 9) })} placeholder="987654321" />
            </>
          )}

          {err && <p className="text-[#C5352B] text-sm">{err}</p>}
          <button
            type="submit"
            disabled={guardando}
            className="min-h-[58px] rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60"
          >
            {guardando ? "Creando…" : modo === "enlace" ? "Crear y sacar enlace" : "Crear comedor y cuenta"}
          </button>
        </form>

        {creado && !enlace && (
          <p className="text-[15px] text-bosque">
            Se creó “{creado}”.{" "}
            <button type="button" onClick={verOllas} className="underline text-[#0F7BA8] font-semibold">Ver la lista</button>
          </p>
        )}
        {enlace && (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] text-bosque">Se creó “{creado}”. Comparte este enlace:</p>
            <EnlaceInvitacion enlace={enlace} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <div className="bg-bosque rounded-[20px] p-[26px] flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <span className="text-xl font-bold text-white">Enlace para registrar una olla nueva</span>
            <span className="text-base text-bosque-suave">
              Envía este enlace por WhatsApp. La persona llena los datos de su olla o comedor, crea su acceso con DNI y PIN, y la olla se crea sola.
            </span>
          </div>
          {!enlaceRegistro ? (
            <button
              type="button"
              disabled={generandoReg}
              onClick={async () => {
                setGenerandoReg(true);
                try {
                  const inv: any = await fnRegistro({ data: {} });
                  setEnlaceRegistro(`${window.location.origin}/invitacion/${inv.token}`);
                } finally {
                  setGenerandoReg(false);
                }
              }}
              className="min-h-14 rounded-full bg-[#20A5E0] text-bosque text-[17px] font-bold hover:bg-[#43BDF0] disabled:opacity-60"
            >
              {generandoReg ? "Generando…" : "Generar enlace de registro"}
            </button>
          ) : (
            <div className="[&_p]:text-bosque-suave [&_a]:text-white [&_input]:bg-white">
              <EnlaceInvitacion enlace={enlaceRegistro} />
            </div>
          )}
        </div>

        <div className="bg-white border border-[#E0E0E0] rounded-[20px] p-[26px] flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1">
            <span className="text-xl font-bold">Enlace para una olla ya creada</span>
            <span className="text-base text-[#475569]">Para sumar a otra socia a un comedor que ya existe.</span>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">Olla o comedor</span>
            <select
              value={existente}
              onChange={(e) => { setExistente(e.target.value); setEnlace2(null); }}
              className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]"
            >
              <option value="">Elige…</option>
              {comedores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <SelectCargo value={cargo2} onChange={(c) => { setCargo2(c); setEnlace2(null); }} label="Cargo que tendrá" />
          <button
            type="button"
            disabled={!existente}
            onClick={async () => {
              const inv: any = await fnInv({ data: { comedor_id: existente, cargo: cargo2 as any } });
              setEnlace2(`${window.location.origin}/invitacion/${inv.token}`);
            }}
            className="min-h-14 rounded-full border border-[#0F7BA8] bg-white text-[#0F7BA8] text-[17px] font-semibold hover:bg-terracota-suave disabled:opacity-50"
          >
            Generar enlace
          </button>
          {enlace2 && <EnlaceInvitacion enlace={enlace2} />}
        </div>
      </div>
    </div>
  );
}

type UsuarioFila = {
  id: string; user_id: string; nombre: string; cargo: string; email: string;
  telefono: string | null; comedor_id: string; comedor_nombre: string;
};

function iniciales(nombre: string) {
  return nombre.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

type PlatformUserRow = {
  userId: string;
  role: PlatformRole;
  name: string;
  email: string;
  dni: string | null;
  phone: string | null;
  accessLevel: AccessLevel | null;
  comedorIds: string[];
  kitchenNames: string[];
};

export function PanelPlatformUsers({
  comedores, mostrarNuevo, setMostrarNuevo, onConteo, pedirConfirmacion,
}: {
  comedores: Fila[];
  mostrarNuevo: boolean;
  setMostrarNuevo: (v: boolean) => void;
  onConteo: (n: number) => void;
  pedirConfirmacion: (c: Confirmacion) => void;
}) {
  const fnListar = useServerFn(listPlatformUsers);
  const fnCrear = useServerFn(createPlatformUser);
  const fnActualizar = useServerFn(updatePlatformUser);
  const fnEliminar = useServerFn(deletePlatformUser);
  const [filas, setFilas] = useState<PlatformUserRow[]>([]);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<PlatformUserRow | null>(null);
  const emptyForm = {
    role: "supervisor" as PlatformRole,
    name: "",
    dni: "",
    pin: "",
    phone: "",
    accessLevel: "view" as AccessLevel,
    comedorIds: [] as string[],
  };
  const [v, setV] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);
  const { pending: creando, run: runCrear } = useSubmitLock();
  const { pending: guardandoEdicion, run: runEditar } = useSubmitLock();

  const cargar = () => {
    fnListar({}).then((r: any) => {
      setFilas(r);
      onConteo(r.length);
    });
  };

  useEffect(() => { cargar(); }, []);

  const closeCreate = () => {
    setMostrarNuevo(false);
    setErr(null);
    setV(emptyForm);
  };

  const lista = filas.filter((f) =>
    (f.name + " " + (f.dni ?? "") + " " + f.email + " " + f.role + " " + f.kitchenNames.join(" ")).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <div className="h-14 max-w-[520px] bg-white border border-[#E0E0E0] rounded-xl px-[18px] flex items-center gap-2.5">
        <Search size={20} className="text-[#718096] shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o DNI"
          className="flex-1 border-0 outline-none bg-transparent text-[17px] text-[#111] min-w-0"
        />
      </div>

      <FormDrawer
        open={mostrarNuevo}
        onOpenChange={(open) => { if (!open) closeCreate(); else setMostrarNuevo(true); }}
        title="Nuevo usuario"
        description="Crea un administrador de plataforma o un supervisor con DNI y PIN."
      >
        <form
          className="flex flex-col gap-5 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            void runCrear(async () => {
              try {
                await fnCrear({ data: v });
                closeCreate();
                cargar();
              } catch (e: any) {
                setErr(friendlyCreatePlatformUserError(e?.message ?? ""));
              }
            });
          }}
        >
          <div className="flex flex-col gap-2.5">
            <span className="text-[15px] font-semibold">Tipo</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { key: "admin" as const, label: "Administrador", sub: "Ve y gestiona todo" },
                { key: "supervisor" as const, label: "Supervisor", sub: "Solo las ollas asignadas" },
              ]).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setV({ ...v, role: m.key })}
                  className={`min-h-[76px] px-[18px] py-3.5 rounded-[14px] text-left flex flex-col gap-0.5 border ${
                    v.role === m.key ? "border-[#0F7BA8] bg-terracota-suave" : "border-[#E0E0E0] bg-white"
                  }`}
                >
                  <span className="text-[17px] font-semibold">{m.label}</span>
                  <span className="text-[15px] opacity-80">{m.sub}</span>
                </button>
              ))}
            </div>
          </div>
          <Campo label="Nombre" value={v.name} onChange={(e: any) => setV({ ...v, name: e.target.value })} required />
          <Campo label="DNI (será su usuario)" value={v.dni} onChange={(e: any) => setV({ ...v, dni: e.target.value.replace(/\D/g, "").slice(0, 8) })} required />
          <Campo label="PIN de acceso (4 a 8 números)" value={v.pin} onChange={(e: any) => setV({ ...v, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} required />
          <Campo label="Celular (opcional)" value={v.phone} onChange={(e: any) => setV({ ...v, phone: e.target.value.replace(/\D/g, "").slice(0, 9) })} />
          {needsSupervisorFields(v.role) && (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[15px] font-semibold">Acceso</span>
                <select
                  value={v.accessLevel}
                  onChange={(e) => setV({ ...v, accessLevel: e.target.value as AccessLevel })}
                  className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]"
                >
                  <option value="view">Solo ver</option>
                  <option value="full">Acceso completo</option>
                </select>
              </label>
              <KitchenMultiSelect
                kitchens={comedores}
                selectedIds={v.comedorIds}
                onChange={(comedorIds) => setV({ ...v, comedorIds })}
              />
            </>
          )}
          {err && <p className="text-[#C5352B] text-sm">{err}</p>}
          <div className="sticky bottom-0 -mx-7 mt-2 flex gap-3 border-t border-[#F0F0F0] bg-white px-7 pt-4 pb-2">
            <button type="button" onClick={closeCreate} className="flex-1 min-h-14 rounded-full border border-[#E0E0E0] text-bosque text-[17px] font-semibold">
              Cancelar
            </button>
            <button type="submit" disabled={creando} className="flex-[1.4] min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] disabled:opacity-60">
              {creando ? "Creando…" : "Crear cuenta"}
            </button>
          </div>
        </form>
      </FormDrawer>

      <div className="bg-white border border-[#E0E0E0] rounded-[20px] overflow-x-auto">
        <div className="min-w-[820px]">
          <div className="grid grid-cols-[minmax(200px,1.4fr)_140px_minmax(160px,1.4fr)_140px_minmax(140px,auto)] gap-4 px-6 py-4 bg-[#FCFCFC] border-b border-[#E0E0E0]">
            <span className="text-sm font-bold uppercase tracking-[0.04em] text-[#718096]">Persona</span>
            <span className="text-sm font-bold uppercase tracking-[0.04em] text-[#718096]">Tipo</span>
            <span className="text-sm font-bold uppercase tracking-[0.04em] text-[#718096]">Ollas</span>
            <span className="text-sm font-bold uppercase tracking-[0.04em] text-[#718096]">Acceso</span>
            <span />
          </div>
          {lista.map((u) => (
            <div
              key={u.userId}
              className="grid grid-cols-[minmax(200px,1.4fr)_140px_minmax(160px,1.4fr)_140px_minmax(140px,auto)] gap-4 px-6 py-[18px] border-b border-[#F0F0F0] items-center"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-11 rounded-full bg-terracota-suave text-bosque grid place-items-center text-base font-bold shrink-0">
                  {iniciales(u.name)}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-lg font-bold truncate">{u.name}</span>
                  <span className="text-[15px] text-[#718096] truncate">{u.dni || u.email}</span>
                </div>
              </div>
              <span className="text-[15px] font-bold px-3.5 py-2 rounded-full bg-terracota-suave text-[#0A5F82] text-center">
                {u.role === "admin" ? "Admin" : "Supervisor"}
              </span>
              <span className="text-[17px] text-[#475569] truncate">{u.role === "supervisor" ? (u.kitchenNames.join(", ") || "—") : "—"}</span>
              <span className="text-[15px] font-bold px-3.5 py-2 rounded-full bg-[#F0F0F0] text-[#475569] text-center">
                {u.role === "supervisor" ? (u.accessLevel === "full" ? "Completo" : "Solo ver") : "—"}
              </span>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setErr(null); setEditando(u); }}
                  className="min-h-11 px-4 rounded-full border border-[#E0E0E0] text-bosque text-[15px] font-semibold"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pedirConfirmacion({
                      titulo: `¿Quitar a ${u.name}?`,
                      texto: u.role === "admin"
                        ? "Perderá el acceso de administrador de la plataforma."
                        : "Perderá el acceso de supervisor. No es integrante de ninguna olla.",
                      onConfirm: async () => {
                        await fnEliminar({ data: { userId: u.userId, deleteAccount: true } });
                        cargar();
                      },
                    });
                  }}
                  className="min-h-11 px-4 rounded-full bg-[#FDECEA] text-[#C5352B] text-[15px] font-semibold inline-flex items-center gap-1.5 justify-center hover:bg-[#F9D8D4] whitespace-nowrap"
                >
                  <Trash2 size={18} /> Eliminar
                </button>
              </div>
            </div>
          ))}
          {lista.length === 0 && (
            <p className="text-center text-[#718096] py-10">Aún no hay usuarios de plataforma.</p>
          )}
        </div>
      </div>

      <FormDrawer
        open={!!editando}
        onOpenChange={(open) => { if (!open) { setEditando(null); setErr(null); } }}
        title="Editar usuario"
        description="Cambia el tipo de cuenta, el nombre o, si es supervisor, el acceso y las ollas."
      >
        {editando && (
          <form
            className="flex flex-col gap-5 pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              setErr(null);
              void runEditar(async () => {
                try {
                  await fnActualizar({
                    data: {
                      userId: editando.userId,
                      name: editando.name,
                      role: editando.role,
                      accessLevel: editando.accessLevel ?? "view",
                      comedorIds: editando.comedorIds,
                    },
                  });
                  setEditando(null);
                  cargar();
                } catch (e: any) {
                  setErr(friendlyCreatePlatformUserError(e?.message ?? ""));
                }
              });
            }}
          >
            <div className="flex flex-col gap-2.5">
              <span className="text-[15px] font-semibold">Tipo</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {([
                  { key: "admin" as const, label: "Administrador", sub: "Ve y gestiona todo" },
                  { key: "supervisor" as const, label: "Supervisor", sub: "Solo las ollas asignadas" },
                ]).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setEditando({
                      ...editando,
                      role: m.key,
                      accessLevel: m.key === "supervisor" ? (editando.accessLevel ?? "view") : null,
                    })}
                    className={`min-h-[76px] px-[18px] py-3.5 rounded-[14px] text-left flex flex-col gap-0.5 border ${
                      editando.role === m.key ? "border-[#0F7BA8] bg-terracota-suave" : "border-[#E0E0E0] bg-white"
                    }`}
                  >
                    <span className="text-[17px] font-semibold">{m.label}</span>
                    <span className="text-[15px] opacity-80">{m.sub}</span>
                  </button>
                ))}
              </div>
            </div>
            <Campo label="Nombre" value={editando.name} onChange={(e: any) => setEditando({ ...editando, name: e.target.value })} required />
            {needsSupervisorFields(editando.role) && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[15px] font-semibold">Acceso</span>
                  <select
                    value={editando.accessLevel ?? "view"}
                    onChange={(e) => setEditando({ ...editando, accessLevel: e.target.value as AccessLevel })}
                    className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]"
                  >
                    <option value="view">Solo ver</option>
                    <option value="full">Acceso completo</option>
                  </select>
                </label>
                <KitchenMultiSelect
                  kitchens={comedores}
                  selectedIds={editando.comedorIds}
                  onChange={(comedorIds) => setEditando({ ...editando, comedorIds })}
                />
              </>
            )}
            {err && <p className="text-[#C5352B] text-sm">{err}</p>}
            <div className="sticky bottom-0 -mx-7 mt-2 flex gap-3 border-t border-[#F0F0F0] bg-white px-7 pt-4 pb-2">
              <button type="button" onClick={() => setEditando(null)} className="flex-1 min-h-14 rounded-full border border-[#E0E0E0] text-bosque text-[17px] font-semibold">Cancelar</button>
              <button type="submit" disabled={guardandoEdicion} className="flex-[1.4] min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold disabled:opacity-60">{guardandoEdicion ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        )}
      </FormDrawer>
    </div>
  );
}

export function PanelUsuarios({
  comedores, mostrarNuevo, setMostrarNuevo, onConteo, pedirConfirmacion,
}: {
  comedores: Fila[];
  mostrarNuevo: boolean;
  setMostrarNuevo: (v: boolean) => void;
  onConteo: (n: number) => void;
  pedirConfirmacion: (c: Confirmacion) => void;
}) {
  const fnListar = useServerFn(adminListarUsuarios);
  const fnCrear = useServerFn(adminCrearUsuario);
  const fnCargo = useServerFn(adminCambiarCargo);
  const fnEliminar = useServerFn(adminEliminarUsuario);
  const [filas, setFilas] = useState<UsuarioFila[]>([]);
  const [q, setQ] = useState("");
  const emptyGestor = { comedor_id: "", nombre: "", cargo: "presidenta", dni: "", pin: "", telefono: "" };
  const [v, setV] = useState(emptyGestor);
  const [err, setErr] = useState<string | null>(null);
  const { pending: guardando, run } = useSubmitLock();

  const cargar = () => {
    fnListar({}).then((r: any) => {
      setFilas(r);
      onConteo(r.length);
    });
  };

  useEffect(() => { cargar(); }, []);

  const closeCreate = () => {
    setMostrarNuevo(false);
    setErr(null);
    setV(emptyGestor);
  };

  const lista = filas.filter((f) =>
    (f.nombre + " " + f.email + " " + f.comedor_nombre).toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      <div className="h-14 max-w-[520px] bg-white border border-[#E0E0E0] rounded-xl px-[18px] flex items-center gap-2.5">
        <Search size={20} className="text-[#718096] shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o correo"
          className="flex-1 border-0 outline-none bg-transparent text-[17px] text-[#111] min-w-0"
        />
      </div>

      <FormDrawer
        open={mostrarNuevo}
        onOpenChange={(open) => { if (!open) closeCreate(); else setMostrarNuevo(true); }}
        title="Nuevo gestor"
        description="Crea una cuenta con DNI y PIN vinculada a una olla o comedor."
      >
        <form
          className="flex flex-col gap-5 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            void run(async () => {
              try {
                await fnCrear({ data: v });
                closeCreate();
                cargar();
              } catch (e: any) {
                setErr(e?.message ?? "No se pudo crear");
              }
            });
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-[15px] font-semibold">Olla o comedor</span>
            <select
              value={v.comedor_id}
              onChange={(e) => setV({ ...v, comedor_id: e.target.value })}
              className="h-14 border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8]"
              required
            >
              <option value="">Elige…</option>
              {comedores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <Campo label="Nombre" value={v.nombre} onChange={(e: any) => setV({ ...v, nombre: e.target.value })} required />
          <SelectCargo value={v.cargo} onChange={(c) => setV({ ...v, cargo: c })} label="Cargo" />
          <Campo label="DNI (será su usuario)" value={v.dni} onChange={(e: any) => setV({ ...v, dni: e.target.value.replace(/\D/g, "").slice(0, 8) })} required />
          <Campo label="PIN de acceso (4 a 8 números)" value={v.pin} onChange={(e: any) => setV({ ...v, pin: e.target.value.replace(/\D/g, "").slice(0, 8) })} required />
          <Campo label="Celular (opcional)" value={v.telefono} onChange={(e: any) => setV({ ...v, telefono: e.target.value })} />
          {err && <p className="text-[#C5352B] text-sm">{err}</p>}
          <div className="sticky bottom-0 -mx-7 mt-2 flex gap-3 border-t border-[#F0F0F0] bg-white px-7 pt-4 pb-2">
            <button type="button" onClick={closeCreate} className="flex-1 min-h-14 rounded-full border border-[#E0E0E0] text-bosque text-[17px] font-semibold">
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className="flex-[1.4] min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] disabled:opacity-60">
              {guardando ? "Creando…" : "Crear cuenta"}
            </button>
          </div>
        </form>
      </FormDrawer>

      <div className="bg-white border border-[#E0E0E0] rounded-[20px] overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[minmax(200px,1.6fr)_minmax(140px,1.6fr)_170px_minmax(150px,auto)] gap-4 px-6 py-4 bg-[#FCFCFC] border-b border-[#E0E0E0]">
            <span className="text-sm font-bold uppercase tracking-[0.04em] text-[#718096]">Persona</span>
            <span className="text-sm font-bold uppercase tracking-[0.04em] text-[#718096]">Qué supervisa</span>
            <span className="text-sm font-bold uppercase tracking-[0.04em] text-[#718096]">Rol</span>
            <span />
          </div>
          {lista.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[minmax(200px,1.6fr)_minmax(140px,1.6fr)_170px_minmax(150px,auto)] gap-4 px-6 py-[18px] border-b border-[#F0F0F0] items-center"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-11 rounded-full bg-terracota-suave text-bosque grid place-items-center text-base font-bold shrink-0">
                  {iniciales(u.nombre)}
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-lg font-bold truncate">{u.nombre}</span>
                  <span className="text-[15px] text-[#718096] truncate">{u.email}</span>
                </div>
              </div>
              <span className="text-[17px] text-[#475569] truncate">{u.comedor_nombre}</span>
              <select
                value={u.cargo}
                onChange={async (e) => {
                  await fnCargo({ data: { vinculo_id: u.id, cargo: e.target.value } });
                  cargar();
                }}
                className="text-[15px] font-bold px-3.5 py-2 rounded-full border-0 bg-terracota-suave text-[#0A5F82] outline-none capitalize"
              >
                {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                type="button"
                onClick={() => {
                  pedirConfirmacion({
                    titulo: `¿Quitar el acceso de ${u.nombre}?`,
                    texto: "Perderá el acceso al panel de su olla. La olla no se modifica.",
                    onConfirm: async () => {
                      await fnEliminar({ data: { vinculo_id: u.id, borrar_cuenta: true } });
                      cargar();
                    },
                  });
                }}
                className="min-h-11 px-4 rounded-full bg-[#FDECEA] text-[#C5352B] text-[15px] font-semibold inline-flex items-center gap-1.5 justify-center hover:bg-[#F9D8D4] whitespace-nowrap"
              >
                <Trash2 size={18} /> Eliminar
              </button>
            </div>
          ))}
          {lista.length === 0 && (
            <p className="text-center text-[#718096] py-10">Aún no hay gestores.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalInvitar({ comedor, cerrar }: { comedor: { id: string; nombre: string }; cerrar: () => void }) {
  const fn = useServerFn(adminCrearInvitacion);
  const [cargo, setCargo] = useState<string>("presidenta");
  const [enlace, setEnlace] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <Overlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-2xl font-bold tracking-[-0.02em]">Invitar a {comedor.nombre}</h3>
        <p className="text-base text-[#475569]">Genera un enlace para que una socia cree su acceso con el cargo que elijas.</p>
      </div>
      <SelectCargo value={cargo} onChange={(c) => { setCargo(c); setEnlace(null); }} label="Cargo que tendrá" />
      {!enlace && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setErr(null);
            setBusy(true);
            try {
              const inv: any = await fn({ data: { comedor_id: comedor.id, cargo: cargo as any } });
              setEnlace(`${window.location.origin}/invitacion/${inv.token}`);
            } catch (e: any) {
              setErr(e?.message ?? "No se pudo generar");
            } finally {
              setBusy(false);
            }
          }}
          className="min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60"
        >
          {busy ? "Generando…" : "Generar enlace"}
        </button>
      )}
      {enlace && <EnlaceInvitacion enlace={enlace} />}
      {err && <p className="text-[#C5352B] text-sm">{err}</p>}
      <button type="button" onClick={cerrar} className="min-h-12 rounded-full border border-[#E0E0E0] text-bosque text-base font-semibold">
        Cerrar
      </button>
    </Overlay>
  );
}
