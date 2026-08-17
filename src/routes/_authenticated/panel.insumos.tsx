import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMiComedor } from "@/lib/useMiComedor";
import { useSubmitLock } from "@/lib/submit-lock";
import { Plus, Minus, FileText } from "lucide-react";
import {
  PanelShell, PanelBack, PanelTitle, PanelCta, PanelField,
  PanelOverlay, panelInputClass,
} from "@/components/panel-ui";

export const Route = createFileRoute("/_authenticated/panel/insumos")({
  head: () => ({ meta: [{ title: "Almacén — La Ollita" }] }),
  component: InsumosPage,
});

type Insumo = {
  id: string;
  nombre: string;
  unidad: "kg" | "L" | "unid";
  stock_actual: number;
  consumo_diario_promedio: number;
  precio_referencial: number | null;
  origen: "municipalidad" | "comprado" | "donado";
};

function diasAutonomia(i: Insumo, consumo: number) {
  if (!consumo || consumo <= 0) return 99;
  return Math.floor(Number(i.stock_actual) / consumo);
}

function semaforo(dias: number, consumo: number) {
  const reponer = consumo > 0 && dias <= 10;
  if (reponer) {
    return {
      pill: "Reponer",
      pillClass: "bg-[#FDF0D4] text-[#8A5A00]",
      alcanzaClass: "text-[#8A5A00]",
    };
  }
  return {
    pill: "Alcanza",
    pillClass: "bg-[rgba(52,168,83,0.14)] text-[#248341]",
    alcanzaClass: "text-[#248341]",
  };
}

function InsumosPage() {
  const { comedor, loading } = useMiComedor();
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [consumos, setConsumos] = useState<Record<string, number>>({});
  const [agregando, setAgregando] = useState(false);
  const [movimiento, setMovimiento] = useState<{ insumo: Insumo; tipo: "ingreso" | "salida"; cantidad: string } | null>(null);
  const [reporte, setReporte] = useState(false);

  const cargar = async () => {
    if (!comedor) return;
    const { data } = await supabase.from("insumos").select("*").eq("comedor_id", comedor.id).order("nombre");
    const lista = (data as Insumo[]) ?? [];
    setInsumos(lista);
    const ids = lista.map((i) => i.id);
    if (ids.length === 0) { setConsumos({}); return; }
    const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: movs } = await supabase
      .from("movimientos_insumo")
      .select("insumo_id,cantidad,fecha")
      .in("insumo_id", ids)
      .eq("tipo", "salida")
      .gte("fecha", desde);
    const acum: Record<string, { total: number; dias: Set<string> }> = {};
    for (const m of movs ?? []) {
      const a = acum[m.insumo_id] ?? (acum[m.insumo_id] = { total: 0, dias: new Set() });
      a.total += Number(m.cantidad) || 0;
      a.dias.add(String(m.fecha));
    }
    setConsumos(Object.fromEntries(Object.entries(acum).map(([k, v]) => [k, v.dias.size ? v.total / v.dias.size : 0])));
  };
  useEffect(() => { cargar(); }, [comedor?.id]);

  const porReponer = insumos.filter((i) => {
    const consumo = consumos[i.id] ?? 0;
    return consumo > 0 && diasAutonomia(i, consumo) <= 10;
  }).length;

  if (loading || !comedor) return null;

  return (
    <PanelShell>
      <PanelBack />
      <PanelTitle
        title="Almacén"
        subtitle={
          insumos.length === 0
            ? "Insumos y stock"
            : porReponer > 0
              ? `${porReponer} insumo${porReponer === 1 ? "" : "s"} por reponer`
              : `${insumos.length} insumo${insumos.length === 1 ? "" : "s"} en stock`
        }
        action={
          <PanelCta onClick={() => setAgregando(true)} className="min-h-[52px] px-[22px] text-[16px] w-auto">
            <Plus size={22} strokeWidth={2} /> Insumo
          </PanelCta>
        }
      />

      <div className="flex flex-col gap-4">
        {insumos.length === 0 && (
          <div className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] text-center text-[17px] text-[#718096]">
            Aún no registras insumos. Toca <strong className="text-[#072249]">+ Insumo</strong> para empezar.
          </div>
        )}

        {insumos.map((i) => {
          const consumo = consumos[i.id] ?? 0;
          const dias = diasAutonomia(i, consumo);
          const s = semaforo(dias, consumo);
          return (
            <div
              key={i.id}
              className="bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-3.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex flex-col gap-[3px]">
                  <h3 className="text-[20px] font-bold text-[#072249] leading-tight">{i.nombre}</h3>
                  <p className="text-[17px] text-[#475569]">
                    {Number(i.stock_actual).toFixed(2)} {i.unidad} en stock
                  </p>
                  <p className="text-[16px] text-[#718096]">
                    {consumo > 0
                      ? `Según lo usado: ${consumo.toFixed(2)} ${i.unidad} por día`
                      : "Aún no hay salidas registradas para calcular el gasto diario"}
                  </p>
                </div>
                <span className={`text-[15px] font-bold px-3 py-[7px] rounded-md whitespace-nowrap shrink-0 ${s.pillClass}`}>
                  {s.pill}
                </span>
              </div>

              <p className={`text-[17px] font-semibold ${s.alcanzaClass}`}>
                {consumo <= 0
                  ? "Registra salidas para saber hasta cuándo te alcanza"
                  : dias <= 0
                    ? "Sin stock"
                    : `Te alcanza ${dias} día${dias === 1 ? "" : "s"} más`}
              </p>

              <div className="flex gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setMovimiento({ insumo: i, tipo: "ingreso", cantidad: "" })}
                  className="flex-1 min-w-[180px] min-h-[52px] gap-2 inline-flex items-center justify-center rounded-full bg-[#C5EBF9] text-[#072249] text-[16px] font-semibold hover:bg-[#A2D9F2]"
                >
                  <Plus size={20} strokeWidth={2} /> Llegó o compré
                </button>
                <button
                  type="button"
                  onClick={() => setMovimiento({
                    insumo: i,
                    tipo: "salida",
                    cantidad: consumo > 0 ? consumo.toFixed(1) : "",
                  })}
                  className="flex-1 min-w-[180px] min-h-[52px] gap-2 inline-flex items-center justify-center rounded-full bg-white border border-[#E0E0E0] text-[#475569] text-[16px] font-semibold hover:border-[#9197B3]"
                >
                  <Minus size={20} strokeWidth={2} /> Usé hoy
                </button>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setReporte(true)}
          className="min-h-14 gap-2 inline-flex items-center justify-center rounded-full bg-[#072249] text-white text-[17px] font-semibold hover:bg-[#0A2E5E]"
        >
          <FileText size={22} strokeWidth={1.75} /> Reporte de gastos del almacén
        </button>
      </div>

      {agregando && <FormInsumo comedorId={comedor.id} cerrar={() => { setAgregando(false); cargar(); }} />}
      {movimiento && <FormMovimiento {...movimiento} cerrar={() => { setMovimiento(null); cargar(); }} />}
      {reporte && <ReporteGastos insumos={insumos} cerrar={() => setReporte(false)} />}
    </PanelShell>
  );
}

type Gasto = { id: string; fecha: string; cantidad: number; precio_unitario: number | null; insumo_id: string; nota: string | null };

function ReporteGastos({ insumos, cerrar }: { insumos: Insumo[]; cerrar: () => void }) {
  const hoy = new Date();
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const [desde, setDesde] = useState(primero);
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cargando, setCargando] = useState(true);

  const porId = useMemo(() => Object.fromEntries(insumos.map((i) => [i.id, i])), [insumos]);

  useEffect(() => {
    const run = async () => {
      setCargando(true);
      const ids = insumos.map((i) => i.id);
      if (ids.length === 0) { setGastos([]); setCargando(false); return; }
      const { data } = await supabase
        .from("movimientos_insumo")
        .select("id,fecha,cantidad,precio_unitario,insumo_id,nota")
        .in("insumo_id", ids)
        .eq("tipo", "ingreso")
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .order("fecha", { ascending: false });
      setGastos((data as Gasto[]) ?? []);
      setCargando(false);
    };
    run();
  }, [desde, hasta, insumos]);

  const filas = gastos.map((g) => {
    const ins = porId[g.insumo_id];
    const precio = Number(g.precio_unitario ?? ins?.precio_referencial ?? 0);
    return {
      ...g,
      nombre: ins?.nombre ?? "—",
      unidad: ins?.unidad ?? "",
      precio,
      total: precio * Number(g.cantidad),
      estimado: g.precio_unitario == null,
    };
  });
  const total = filas.reduce((s, f) => s + f.total, 0);

  const descargar = () => {
    const csv = [
      ["Fecha", "Insumo", "Cantidad", "Unidad", "Precio unitario", "Total", "Nota"].join(","),
      ...filas.map((f) => [f.fecha, `"${f.nombre}"`, f.cantidad, f.unidad, f.precio.toFixed(2), f.total.toFixed(2), `"${f.nota ?? ""}"`].join(",")),
      ["", "", "", "", "TOTAL", total.toFixed(2), ""].join(","),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `gastos-almacen-${desde}-a-${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PanelOverlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-[24px] font-bold tracking-[-0.02em] text-[#072249]">Reporte de gastos</h3>
        <p className="text-[17px] text-[#475569]">Entradas de insumos en el período</p>
      </div>
      <div className="flex flex-col gap-[18px]">
        <div className="grid grid-cols-2 gap-3">
          <PanelField label="Desde">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={panelInputClass()} />
          </PanelField>
          <PanelField label="Hasta">
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={panelInputClass()} />
          </PanelField>
        </div>
        {cargando ? (
          <p className="text-[17px] text-[#718096] py-4 text-center">Cargando…</p>
        ) : filas.length === 0 ? (
          <p className="text-[17px] text-[#718096] py-4 text-center">No hay entradas de insumos en esas fechas.</p>
        ) : (
          <ul className="flex flex-col gap-0 text-[17px] max-h-64 overflow-y-auto">
            {filas.map((f) => (
              <li key={f.id} className="flex justify-between gap-2 border-b border-[#F0F0F0] py-2.5">
                <span className="min-w-0">
                  <span className="font-semibold text-[#072249]">{f.nombre}</span>{" "}
                  <span className="text-[#718096]">{Number(f.cantidad).toFixed(1)} {f.unidad} · {new Date(f.fecha + "T12:00").toLocaleDateString("es-PE", { day: "numeric", month: "short" })}</span>
                  {f.estimado && <span className="text-[13px] text-[#8A5A00]"> (estimado)</span>}
                </span>
                <span className="font-semibold whitespace-nowrap text-[#072249]">S/ {f.total.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-between font-bold text-[18px]">
          <span className="text-[#072249]">Total gastado</span>
          <span className="text-[#072249]">S/ {total.toFixed(2)}</span>
        </div>
        <PanelCta onClick={descargar} disabled={filas.length === 0} className="w-full">
          Descargar reporte (CSV)
        </PanelCta>
      </div>
    </PanelOverlay>
  );
}

function FormInsumo({ comedorId, cerrar }: { comedorId: string; cerrar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [unidad, setUnidad] = useState<"kg" | "L" | "unid">("kg");
  const [stock, setStock] = useState("0");
  const [precio, setPrecio] = useState("");
  const [origen, setOrigen] = useState<"municipalidad" | "comprado" | "donado">("comprado");
  const { pending, run } = useSubmitLock();
  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { error } = await supabase.from("insumos").insert({
        comedor_id: comedorId,
        nombre: nombre.trim(),
        unidad,
        stock_actual: Number(stock),
        consumo_diario_promedio: 0,
        precio_referencial: origen === "comprado" && precio ? Number(precio) : null,
        origen,
      });
      if (error) { alert(error.message); return; }
      cerrar();
    });
  };
  return (
    <PanelOverlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-[24px] font-bold tracking-[-0.02em] text-[#072249]">Agregar insumo</h3>
        <p className="text-[17px] text-[#475569]">El gasto por día se calcula solo, con las salidas que registres.</p>
      </div>
      <form onSubmit={guardar} className="flex flex-col gap-[18px]">
        <PanelField label="Nombre">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required className={panelInputClass()} placeholder="Ej. Arroz" />
        </PanelField>
        <div className="grid grid-cols-2 gap-3">
          <PanelField label="Unidad">
            <select value={unidad} onChange={(e) => setUnidad(e.target.value as any)} className={panelInputClass()}>
              <option value="kg">kg</option><option value="L">L</option><option value="unid">unidad</option>
            </select>
          </PanelField>
          <PanelField label="Stock actual">
            <input type="number" step="0.1" value={stock} onChange={(e) => setStock(e.target.value)} className={panelInputClass()} />
          </PanelField>
        </div>
        <PanelField label="Origen">
          <select value={origen} onChange={(e) => setOrigen(e.target.value as any)} className={panelInputClass()}>
            <option value="comprado">Comprado</option><option value="municipalidad">Municipalidad</option><option value="donado">Donado</option>
          </select>
        </PanelField>
        {origen === "comprado" && (
          <PanelField label="Precio referencial (S/)" note="Para el plan de compra">
            <input type="number" step="0.10" value={precio} onChange={(e) => setPrecio(e.target.value)} className={panelInputClass()} placeholder="0.00" />
          </PanelField>
        )}
        <div className="flex gap-2.5">
          <button type="button" onClick={cerrar} className="flex-1 min-h-14 rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[17px] font-semibold">
            Cancelar
          </button>
          <PanelCta type="submit" loading={pending} className="flex-[1.4]">
            Guardar insumo
          </PanelCta>
        </div>
      </form>
    </PanelOverlay>
  );
}

function FormMovimiento({ insumo, tipo, cantidad: cantIni, cerrar }: { insumo: Insumo; tipo: "ingreso" | "salida"; cantidad: string; cerrar: () => void }) {
  const [cantidad, setCantidad] = useState(cantIni);
  const [nota, setNota] = useState("");
  const [precio, setPrecio] = useState(insumo.precio_referencial != null ? String(insumo.precio_referencial) : "");
  const [origenMov, setOrigenMov] = useState<"compra" | "donacion">("compra");
  const { pending, run } = useSubmitLock();
  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    const c = Number(cantidad);
    if (!c || c <= 0) return;
    void run(async () => {
      const nuevoStock = tipo === "ingreso" ? Number(insumo.stock_actual) + c : Number(insumo.stock_actual) - c;
      const notaFinal = tipo === "ingreso"
        ? [origenMov === "compra" ? "Compra" : "Donación", nota.trim()].filter(Boolean).join(" · ") || null
        : nota.trim() || null;
      const { error: e1 } = await supabase.from("movimientos_insumo").insert({
        insumo_id: insumo.id,
        tipo,
        cantidad: c,
        nota: notaFinal,
        precio_unitario: tipo === "ingreso" && origenMov === "compra" && precio ? Number(precio) : null,
      });
      const { error: e2 } = await supabase.from("insumos").update({ stock_actual: Math.max(0, nuevoStock) }).eq("id", insumo.id);
      if (e1 || e2) { alert((e1 ?? e2)!.message); return; }
      cerrar();
    });
  };

  const esEntrada = tipo === "ingreso";

  return (
    <PanelOverlay onClose={cerrar}>
      <div className="flex flex-col gap-1">
        <h3 className="text-[24px] font-bold tracking-[-0.02em] text-[#072249]">
          {esEntrada ? "Llegó o compré" : "Usé hoy"}
        </h3>
        <p className="text-[17px] text-[#475569]">
          {esEntrada ? "Suma al stock del almacén." : "Descuenta del stock del almacén."}
          {" "}
          <span className="font-semibold text-[#072249]">{insumo.nombre}</span>
        </p>
      </div>
      <form onSubmit={guardar} className="flex flex-col gap-[18px]">
        <PanelField label={esEntrada ? "Cantidad que entró" : "Cantidad que usaste"}>
          <input
            type="number"
            step="0.1"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            className={panelInputClass()}
            placeholder={esEntrada ? `25 ${insumo.unidad}` : `2.2 ${insumo.unidad}`}
            autoFocus
          />
        </PanelField>
        {esEntrada && (
          <PanelField label="De dónde viene">
            <div className="grid grid-cols-2 gap-2">
              {([
                ["compra", "Compra"],
                ["donacion", "Donación"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOrigenMov(key)}
                  className={`min-h-14 rounded-xl text-[16px] font-semibold text-[#072249] border ${
                    origenMov === key ? "border-[#0F7BA8] bg-[#C5EBF9]" : "border-[#E0E0E0] bg-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </PanelField>
        )}
        {esEntrada && origenMov === "compra" && (
          <PanelField label={`Precio por ${insumo.unidad} (S/)`} note="Para el reporte de gastos">
            <input type="number" step="0.10" value={precio} onChange={(e) => setPrecio(e.target.value)} className={panelInputClass()} />
          </PanelField>
        )}
        <PanelField label="Nota · opcional">
          <input value={nota} onChange={(e) => setNota(e.target.value)} className={panelInputClass()} placeholder="Ej. Compra del lunes" />
        </PanelField>
        <div className="flex gap-2.5">
          <button type="button" onClick={cerrar} className="flex-1 min-h-14 rounded-full bg-white border border-[#E0E0E0] text-[#072249] text-[17px] font-semibold">
            Cancelar
          </button>
          <PanelCta type="submit" loading={pending} loadingText={esEntrada ? "Guardando…" : "Descontando…"} className="flex-[1.4]">
            {esEntrada ? "Sumar al almacén" : "Descontar"}
          </PanelCta>
        </div>
      </form>
    </PanelOverlay>
  );
}
