import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  MapPin, ArrowLeft, Clock, Wallet, Navigation, Search,
  Camera, ImagePlus, CheckCircle2, Info,
} from "lucide-react";
import { z } from "zod";
import { subirFoto } from "@/lib/subirFoto";
import logoOllita from "@/assets/logo-ollita.svg";

export const Route = createFileRoute("/comedor/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Comedor — La Ollita" },
      { name: "description", content: "Menú del día, raciones disponibles y cómo apartar." },
    ],
  }),
  component: ComedorPage,
});

type TipoComedor = "comedor" | "olla" | "restaurante";

function tipoLabel(t: TipoComedor) {
  if (t === "olla") return "Olla común";
  if (t === "restaurante") return "Negocio de menú";
  return "Comedor popular";
}

function esSocial(t: TipoComedor) {
  return t === "comedor" || t === "olla";
}

function formatHora(h: string) {
  const [hh, mm] = h.slice(0, 5).split(":");
  const n = Number(hh);
  const m = mm ?? "00";
  if (n === 0) return `12:${m} am`;
  if (n < 12) return `${n}:${m} am`;
  if (n === 12) return `12:${m} pm`;
  return `${n - 12}:${m} pm`;
}

function horarioValor(comedor: any) {
  const ini = formatHora(comedor.horario_inicio);
  const fin = formatHora(comedor.horario_fin);
  if (esSocial(comedor.tipo)) return `Recojo ${ini} – ${fin}`;
  return `Atiende ${ini} – ${fin}`;
}

function ComedorPage() {
  const { id } = useParams({ from: "/comedor/$id" });
  const [comedor, setComedor] = useState<any>(null);
  const [menu, setMenu] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [mostrarReserva, setMostrarReserva] = useState(false);
  const [confirmacion, setConfirmacion] = useState<string | null>(null);

  const cargar = async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const [c, m] = await Promise.all([
      supabase.from("comedores").select("*").eq("id", id).single(),
      supabase
        .from("menus")
        .select("*")
        .eq("comedor_id", id)
        .eq("fecha", hoy)
        .eq("publicado", true)
        .maybeSingle(),
    ]);
    setComedor(c.data);
    setMenu(m.data);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, [id]);

  if (loading) {
    return <div className="min-h-screen bg-[#F0F0F0] p-8 text-center text-[#718096] text-[17px]">Cargando…</div>;
  }
  if (!comedor) {
    return <div className="min-h-screen bg-[#F0F0F0] p-8 text-center text-[#072249] text-[17px]">No encontramos este comedor.</div>;
  }

  const social = esSocial(comedor.tipo as TipoComedor);
  const libres = menu?.raciones_disponibles ?? 0;
  const agotado = !!menu && libres === 0;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${comedor.lat},${comedor.lng}`;
  const pagoTexto = comedor.yape_numero
    ? `Efectivo, Yape o Plin (${comedor.yape_numero})`
    : "Efectivo, Yape o Plin";

  return (
    <div className="min-h-screen bg-[#F0F0F0] text-[#072249]">
      <header className="bg-white border-b border-[#E0E0E0] sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-8 py-4 flex items-center gap-4">
          <Link
            to="/"
            className="size-12 shrink-0 grid place-items-center rounded-full bg-white border border-[#E0E0E0] text-[#072249] hover:border-[#0F7BA8]"
            aria-label="Volver"
          >
            <ArrowLeft size={26} strokeWidth={1.75} />
          </Link>
          <h1 className="flex-1 text-[20px] font-bold text-[#072249] truncate">{comedor.nombre}</h1>
          <Link to="/" className="shrink-0">
            <img src={logoOllita} alt="La Ollita" className="h-[30px] w-auto" />
          </Link>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-8 py-7 pb-16 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="flex flex-col gap-5">
          <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-[26px] flex flex-col gap-3">
            <span
              className={`self-start text-[14px] font-bold px-3 py-1.5 rounded-md ${
                social ? "bg-[#C5EBF9] text-[#072249]" : "bg-[#F0F0F0] text-[#475569]"
              }`}
            >
              {tipoLabel(comedor.tipo)}
            </span>
            <h2 className="text-[30px] font-bold tracking-[-0.02em] text-[#072249] leading-tight">
              {comedor.nombre}
            </h2>
            <p className="flex items-center gap-2 text-[17px] text-[#475569]">
              <MapPin size={22} className="text-[#718096] shrink-0" strokeWidth={1.75} />
              <span>
                {comedor.direccion}
                {comedor.distrito ? `, ${comedor.distrito}` : ""}
              </span>
            </p>
            {comedor.descripcion && (
              <p className="text-[16px] text-[#718096]">{comedor.descripcion}</p>
            )}
          </section>

          <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-[26px] flex flex-col gap-5">
            <h3 className="text-[20px] font-bold text-[#072249]">Menú de hoy</h3>

            {!menu ? (
              <>
                <div className="bg-[#072249] rounded-2xl p-[26px]">
                  <p className="text-[24px] font-bold text-white">Aún no publica el menú de hoy</p>
                  <p className="text-[17px] text-[#A2D9F2] mt-1.5">Vuelve más tarde.</p>
                </div>
                <p className="text-[16px] text-[#718096] text-center">No necesitas cuenta. Solo tu DNI.</p>
              </>
            ) : (
              <>
                {menu.foto_url && (
                  <img
                    src={menu.foto_url}
                    alt={menu.nombre_plato}
                    className="w-full h-48 object-cover rounded-2xl"
                  />
                )}
                <div className="bg-[#072249] rounded-2xl p-[26px] flex items-end justify-between gap-5 flex-wrap">
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <span className="text-[24px] font-bold text-white">{menu.nombre_plato}</span>
                    {menu.descripcion && (
                      <span className="text-[17px] text-[#A2D9F2]">{menu.descripcion}</span>
                    )}
                  </div>
                  <span className="text-[40px] font-bold text-white tracking-[-0.02em] leading-none">
                    S/ {Number(menu.precio).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  {agotado ? (
                    <span className="bg-[#F0F0F0] text-[#718096] text-[15px] font-bold px-3.5 py-2 rounded-md">
                      Agotado por hoy
                    </span>
                  ) : (
                    <span className="bg-[rgba(52,168,83,0.14)] text-[#248341] text-[15px] font-bold px-3.5 py-2 rounded-md">
                      {libres} raciones libres
                    </span>
                  )}
                  <span className="text-[16px] text-[#718096]">
                    Se sirve hasta las {formatHora(comedor.horario_fin)} o hasta que se acabe.
                  </span>
                </div>

                {agotado ? (
                  <button
                    type="button"
                    disabled
                    className="min-h-[60px] rounded-full bg-[#F0F0F0] text-[#9197B3] text-[19px] font-semibold cursor-not-allowed"
                  >
                    Agotado por hoy
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMostrarReserva(true)}
                    className="min-h-[60px] rounded-full bg-[#0F7BA8] text-white text-[19px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]"
                  >
                    Apartar mi ración
                  </button>
                )}
                <p className="text-[16px] text-[#718096] text-center">No necesitas cuenta. Solo tu DNI.</p>
              </>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-5 flex flex-col gap-4">
            {comedor.foto_url ? (
              <div className="h-[220px] rounded-[14px] overflow-hidden relative">
                <img
                  src={comedor.foto_url}
                  alt={comedor.nombre}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="h-[220px] rounded-[14px] bg-[#C5EBF9] relative overflow-hidden">
                <MapPin
                  size={44}
                  className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 text-[#0F7BA8]"
                  strokeWidth={1.5}
                />
                <span className="absolute left-4 bottom-3.5 text-[15px] text-[#072249]/70">
                  Ubicación aproximada
                </span>
              </div>
            )}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="min-h-[52px] gap-2 inline-flex items-center justify-center rounded-full bg-white border border-[#0F7BA8] text-[#0F7BA8] text-[16px] font-semibold hover:bg-[#C5EBF9]"
            >
              <Navigation size={22} strokeWidth={1.75} /> Cómo llegar
            </a>
          </section>

          <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-6 flex flex-col gap-[18px]">
            <DatoIcono icon={Clock} label="Horario de hoy" valor={horarioValor(comedor)} />
            <DatoIcono icon={Wallet} label="Cómo pagar" valor={pagoTexto} />
            <DatoIcono
              icon={MapPin}
              label="Dirección"
              valor={`${comedor.direccion}${comedor.distrito ? `, ${comedor.distrito}` : ""}`}
            />
          </section>
        </aside>
      </main>

      {mostrarReserva && menu && (
        <FormularioReserva
          menu={menu}
          comedor={comedor}
          cerrar={() => setMostrarReserva(false)}
          confirmar={(codigo: string) => {
            setMostrarReserva(false);
            setConfirmacion(codigo);
            cargar();
          }}
        />
      )}

      {confirmacion && (
        <ConfirmacionReserva
          codigo={confirmacion}
          horaLimite={formatHora(comedor.horario_fin)}
          cerrar={() => setConfirmacion(null)}
        />
      )}
    </div>
  );
}

function DatoIcono({
  icon: Icon,
  label,
  valor,
}: {
  icon: typeof Clock;
  label: string;
  valor: string;
}) {
  return (
    <div className="flex gap-3.5 items-start">
      <Icon size={26} className="text-[#0F7BA8] shrink-0" strokeWidth={1.75} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[15px] text-[#718096]">{label}</span>
        <span className="text-[17px] font-semibold text-[#072249]">{valor}</span>
      </div>
    </div>
  );
}

const reservaSchema = z.object({
  nombre: z.string().trim().min(2, "Pon tu nombre").max(80),
  telefono: z
    .string()
    .refine((v) => !v || /^\d{9}$/.test(v), "El teléfono debe tener 9 dígitos"),
  dni: z.string().regex(/^\d{8}$/, "El DNI debe tener 8 dígitos"),
  cantidad: z.number().int().min(1).max(50),
});

function FormularioReserva({ menu, comedor, cerrar, confirmar }: any) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [dni, setDni] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [verificando, setVerificando] = useState(false);
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const [padron, setPadron] = useState<
    | { estado: "sin_verificar" }
    | { estado: "no_encontrado" }
    | { estado: "encontrado"; id: string; nombre: string; categoria: string; vigente: boolean; activo: boolean }
  >({ estado: "sin_verificar" });

  const maxPorReserva = comedor.max_raciones_por_reserva ?? 5;

  const verificarPadron = async () => {
    setError(null);
    if (!/^\d{8}$/.test(dni)) {
      setError("El DNI debe tener 8 dígitos");
      return;
    }
    setVerificando(true);
    const { data, error: err } = await supabase.rpc("verificar_padron", {
      _comedor_id: comedor.id,
      _dni: dni,
    });
    setVerificando(false);
    if (err) {
      setError("No pudimos verificar tu DNI. Intenta de nuevo.");
      return;
    }
    const fila = Array.isArray(data) ? data[0] : null;
    if (!fila) {
      setPadron({ estado: "no_encontrado" });
      return;
    }
    setPadron({
      estado: "encontrado",
      id: fila.beneficiario_id as string,
      nombre: fila.nombre_completo as string,
      categoria: fila.categoria as string,
      vigente: Boolean(fila.vigente),
      activo: Boolean(fila.activo),
    });
    setNombre(fila.nombre_completo as string);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (padron.estado === "sin_verificar") {
      setError("Primero verifica tu DNI");
      return;
    }
    if (padron.estado === "encontrado" && !padron.activo) {
      setError("Tu registro en el padrón está inactivo. Acércate al comedor.");
      return;
    }
    const parsed = reservaSchema.safeParse({ nombre, telefono, dni, cantidad });
    if (!parsed.success) {
      setError(parsed.error.issues[0]!.message);
      return;
    }
    if (cantidad > maxPorReserva) {
      setError(`Este comedor permite máximo ${maxPorReserva} raciones por reserva`);
      return;
    }
    if (cantidad > menu.raciones_disponibles) {
      setError("No hay tantas raciones disponibles");
      return;
    }
    setEnviando(true);
    const codigo = generarCodigo();
    let comprobanteUrl: string | null = null;
    if (comprobante) {
      try {
        comprobanteUrl = await subirFoto(comprobante, "pagos");
      } catch {
        setEnviando(false);
        setError("No pudimos subir la captura. Intenta de nuevo o aparta sin captura.");
        return;
      }
    }
    const { error: err } = await supabase.from("reservas").insert({
      menu_id: menu.id,
      comedor_id: comedor.id,
      codigo,
      nombre_comensal: nombre.trim(),
      telefono: telefono || null,
      dni,
      cantidad,
      comprobante_url: comprobanteUrl,
      beneficiario_id: padron.estado === "encontrado" ? padron.id : null,
    });
    setEnviando(false);
    if (err) {
      setError(err.message);
      return;
    }
    confirmar(codigo);
  };

  const aviso =
    padron.estado === "sin_verificar"
      ? {
          text: "Verifica tu DNI para saber si el comedor ya te tiene en su padrón.",
          ok: false as const,
          icon: Info,
        }
      : padron.estado === "encontrado"
        ? {
            text: `Estás en el padrón como ${padron.nombre}. Tu nombre se llena solo.`,
            ok: true as const,
            icon: CheckCircle2,
          }
        : {
            text: "No estás en el padrón. Igual puedes apartar tu ración.",
            ok: false as const,
            icon: Info,
          };

  return (
    <div
      className="fixed inset-0 bg-[rgba(7,34,73,0.55)] z-50 flex items-end sm:items-center justify-center sm:p-8"
      onClick={cerrar}
    >
      <div
        className="bg-white rounded-t-[24px] sm:rounded-[24px] max-w-[540px] w-full p-6 sm:p-7 flex flex-col gap-5 max-h-[92vh] overflow-y-auto shadow-[0_12px_40px_rgba(7,34,73,0.30)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden mx-auto h-1.5 w-10 rounded-full bg-[#E0E0E0]" />
        <div className="flex flex-col gap-1">
          <h3 className="text-[26px] font-bold tracking-[-0.02em] text-[#072249]">
            Apartar mi ración
          </h3>
          <p className="text-[17px] text-[#475569]">
            Te guardamos tu plato. Recógelo antes de las {formatHora(comedor.horario_fin)}.
          </p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[15px] font-semibold text-[#072249]">Tu DNI (8 dígitos)</label>
            <div className="flex gap-2.5">
              <input
                value={dni}
                onChange={(e) => {
                  setDni(e.target.value.replace(/\D/g, "").slice(0, 8));
                  setPadron({ estado: "sin_verificar" });
                }}
                className="h-14 flex-1 rounded-xl border border-[#E0E0E0] px-4 text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8] min-w-0"
                placeholder="12345678"
                inputMode="numeric"
                autoFocus
              />
              <button
                type="button"
                onClick={verificarPadron}
                disabled={verificando}
                className="min-h-14 px-5 gap-2 inline-flex items-center rounded-xl bg-[#0F7BA8] text-white text-[16px] font-semibold shrink-0 hover:bg-[#0A5F82] disabled:opacity-60"
              >
                <Search size={22} strokeWidth={1.75} />
                {verificando ? "…" : "Verificar"}
              </button>
            </div>
            <div
              className={`rounded-xl p-3.5 flex gap-2.5 items-start text-[16px] ${
                aviso.ok
                  ? "bg-[rgba(52,168,83,0.12)] text-[#248341]"
                  : "bg-[#C5EBF9] text-[#072249]"
              }`}
            >
              <aviso.icon size={22} className="shrink-0 mt-0.5" strokeWidth={1.75} />
              <span className="flex-1">{aviso.text}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[15px] font-semibold text-[#072249]">Tu nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              readOnly={padron.estado === "encontrado"}
              className="h-14 w-full rounded-xl border border-[#E0E0E0] px-4 text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8] read-only:bg-[#FCFCFC] read-only:text-[#072249]"
              placeholder={padron.estado === "encontrado" ? padron.nombre : "Ej. María Quispe"}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[15px] font-semibold text-[#072249]">
              Tu celular <span className="font-normal text-[#718096]">· opcional</span>
            </label>
            <input
              value={telefono}
              onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 9))}
              className="h-14 w-full rounded-xl border border-[#E0E0E0] px-4 text-[17px] text-[#111111] outline-none focus:border-[#0F7BA8]"
              placeholder="987654321"
              inputMode="numeric"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[15px] font-semibold text-[#072249]">Cantidad de raciones</label>
            <div className="bg-[#F0F0F0] rounded-2xl px-[18px] py-3.5 flex items-center gap-[18px]">
              <button
                type="button"
                onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                className="size-[52px] rounded-full bg-white text-[#0F7BA8] text-[26px] font-semibold shadow-[0_2px_6px_rgba(7,34,73,0.10)]"
              >
                −
              </button>
              <span className="text-[28px] font-bold text-[#072249] min-w-[44px] text-center">
                {cantidad}
              </span>
              <button
                type="button"
                onClick={() => setCantidad(Math.min(maxPorReserva, cantidad + 1))}
                className="size-[52px] rounded-full bg-white text-[#0F7BA8] text-[26px] font-semibold shadow-[0_2px_6px_rgba(7,34,73,0.10)]"
              >
                +
              </button>
              <div className="flex-1 flex flex-col gap-0.5 items-end">
                <span className="text-[15px] text-[#718096]">Máx. {maxPorReserva} por persona</span>
                <span className="text-[22px] font-bold text-[#072249]">
                  Total S/ {(cantidad * Number(menu.precio)).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[15px] font-semibold text-[#072249]">
              Captura del pago <span className="font-normal text-[#718096]">· opcional</span>
            </label>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => camaraRef.current?.click()}
                className="flex-1 min-h-14 gap-2 inline-flex items-center justify-center rounded-xl border border-dashed border-[#A2D9F2] bg-[#FCFCFC] text-[#0F7BA8] text-[16px] font-semibold hover:border-[#0F7BA8]"
              >
                <Camera size={22} strokeWidth={1.75} /> Tomar foto
              </button>
              <button
                type="button"
                onClick={() => galeriaRef.current?.click()}
                className="flex-1 min-h-14 gap-2 inline-flex items-center justify-center rounded-xl border border-dashed border-[#A2D9F2] bg-[#FCFCFC] text-[#0F7BA8] text-[16px] font-semibold hover:border-[#0F7BA8]"
              >
                <ImagePlus size={22} strokeWidth={1.75} /> Subir captura
              </button>
            </div>
            <input
              ref={camaraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
            />
            <input
              ref={galeriaRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
            />
            {comprobante && (
              <p className="text-[15px] text-[#0F7BA8] font-semibold">Adjuntaste: {comprobante.name}</p>
            )}
            <p className="text-[16px] text-[#718096]">
              Si ya pagaste por Yape o Plin, adjunta la captura. También puedes pagar al recoger.
            </p>
          </div>

          {error && <p className="text-[15px] text-[#C5352B]">{error}</p>}

          <div className="flex gap-3 mt-1">
            <button
              type="button"
              onClick={cerrar}
              className="flex-1 min-h-[58px] rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[17px] font-semibold hover:border-[#9197B3]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="flex-[1.4] min-h-[58px] rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] disabled:opacity-60"
            >
              {enviando ? "Apartando…" : "Confirmar reserva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmacionReserva({
  codigo,
  horaLimite,
  cerrar,
}: {
  codigo: string;
  horaLimite: string;
  cerrar: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-[rgba(7,34,73,0.95)] z-50 flex items-center justify-center p-6 text-center">
      <div className="max-w-sm w-full flex flex-col gap-4 items-center">
        <div className="size-24 rounded-full bg-[#C5EBF9] text-[#0F7BA8] grid place-items-center">
          <CheckCircle2 size={48} strokeWidth={1.75} />
        </div>
        <h3 className="text-[26px] font-bold text-white tracking-[-0.02em]">
          ¡Tu ración está apartada!
        </h3>
        <p className="text-[17px] text-[#A2D9F2]">Muestra este código al recoger:</p>
        <div className="w-full bg-white text-[#072249] text-5xl font-bold tracking-tight rounded-[20px] py-6">
          {codigo}
        </div>
        <p className="text-[16px] text-[#A2D9F2]">
          Recoge tu ración antes de las {horaLimite}. Trae tu olla o táper.
        </p>
        <button
          type="button"
          onClick={cerrar}
          className="min-h-[58px] w-full rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82]"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

function generarCodigo() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "M-";
  for (let i = 0; i < 3; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
