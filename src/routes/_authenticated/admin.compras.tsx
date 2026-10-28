import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AdminSelect } from "@/components/admin/admin-select";
import { todayISO } from "@/lib/dates";
import { formatG1Number } from "@/lib/g1";
import { monthRange, shiftMonth } from "@/lib/g3";
import { listGroups, type GroupRow } from "@/lib/groups.functions";
import { getJointPurchase, saveJointPurchase } from "@/lib/joint-purchases.functions";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useSubmitLock } from "@/lib/submit-lock";
import { friendlySupabaseError } from "@/lib/supabase-errors";

export const Route = createFileRoute("/_authenticated/admin/compras")({
  head: () => ({ meta: [{ title: "Compras conjuntas — La Ollita" }] }),
  component: ComprasPage,
});

type Kitchen = { id: string; nombre: string; hasData: boolean; selected: boolean };
type Item = { key: string; label: string; unit: string; quantity: number; currentPrice: number | null; negotiated: number | null };

function ComprasPage() {
  const fnGroups = useServerFn(listGroups);
  const fnGet = useServerFn(getJointPurchase);
  const fnSave = useServerFn(saveJointPurchase);
  const { pending, run } = useSubmitLock();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState("");
  const [monthStart, setMonthStart] = useState(() => shiftMonth(todayISO(), 1));
  const [saved, setSaved] = useState(false);
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fnGroups({})
      .then((rows) => {
        setGroups(rows);
        setGroupId((cur) => cur || rows[0]?.id || "");
      })
      .catch((e: any) => void notifyError(friendlySupabaseError(e?.message ?? "No pudimos cargar los grupos.")));
  }, []);

  const cargar = async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const r = await fnGet({ data: { groupId, monthStart } });
      setSaved(r.saved);
      setKitchens(r.kitchens);
      setItems(r.items);
      setPrices(Object.fromEntries(r.items.map((i) => [i.key, i.negotiated == null ? "" : i.negotiated.toFixed(2)])));
    } catch (e: any) {
      void notifyError(friendlySupabaseError(e?.message ?? "No pudimos armar la compra."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, [groupId, monthStart]);

  const toggle = (id: string) =>
    setKitchens((cur) => cur.map((k) => (k.id === id ? { ...k, selected: !k.selected } : k)));

  const guardar = () => {
    void run(async () => {
      try {
        await fnSave({
          data: {
            groupId,
            monthStart,
            kitchenIds: kitchens.filter((k) => k.selected).map((k) => k.id),
            prices: items.map((i) => ({
              supplyKey: i.key,
              label: i.label,
              unit: i.unit,
              price: prices[i.key]?.trim() ? Number(prices[i.key]) : null,
            })),
          },
        });
        void notifySuccess("Se guardó la compra conjunta.");
        await cargar();
      } catch (e: any) {
        void notifyError(friendlySupabaseError(e?.message ?? "No pudimos guardar la compra."));
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
        <AdminSelect
          label="Grupo"
          value={groupId}
          onValueChange={setGroupId}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
          placeholder="Sin grupos"
          className="min-w-[220px] flex-1"
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[15px] font-semibold text-bosque">Compra para</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonthStart((m) => shiftMonth(m, -1))}
              className="size-14 rounded-xl border border-[#E0E0E0] bg-white grid place-items-center text-[#475569] hover:border-[#0F7BA8]"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={22} />
            </button>
            <span className="min-w-[168px] text-center text-[17px] font-semibold text-[#072249]">
              {monthRange(monthStart).label}
            </span>
            <button
              type="button"
              onClick={() => setMonthStart((m) => shiftMonth(m, 1))}
              className="size-14 rounded-xl border border-[#E0E0E0] bg-white grid place-items-center text-[#475569] hover:border-[#0F7BA8]"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={22} />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-[17px] text-[#718096]">Armando la compra…</p>
      ) : groupId ? (
        <>
          <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-5 flex flex-col gap-3">
            <h3 className="text-[19px] font-bold text-[#072249]">Comedores que participan</h3>
            <p className="text-[15px] text-[#718096]">
              {saved ? "Compra guardada." : "Aún no se guarda: marcamos los comedores con datos de almacén."}
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {kitchens.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => toggle(k.id)}
                  aria-pressed={k.selected}
                  className={`min-h-14 px-4 rounded-xl border text-left text-[17px] font-semibold ${
                    k.selected ? "border-[#0F7BA8] bg-[#C5EBF9] text-[#072249]" : "border-[#E0E0E0] bg-white text-[#475569]"
                  }`}
                >
                  {k.nombre}
                  {!k.hasData && <span className="block text-[14px] font-normal text-[#718096]">Sin datos de almacén</span>}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white border border-[#E0E0E0] rounded-[20px] p-5 flex flex-col gap-3">
            <h3 className="text-[19px] font-bold text-[#072249]">Lista consolidada y precios negociados</h3>
            <p className="text-[15px] text-[#718096]">
              Cantidad: lo que usa cada comedor por día × sus días de atención del mes, menos su stock. Deja vacío el
              precio de lo que no se negoció.
            </p>
            {items.length === 0 ? (
              <p className="text-[17px] text-[#718096]">No hay insumos comprados que haga falta reponer este mes.</p>
            ) : (
              <div className="flex flex-col divide-y divide-[#E0E0E0]">
                {items.map((i) => (
                  <div key={i.key} className="py-3 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-[17px] font-semibold text-[#072249]">{i.label}</p>
                      <p className="text-[15px] text-[#718096]">
                        {formatG1Number(i.quantity)} {i.unit} · precio actual{" "}
                        {i.currentPrice == null ? "sin dato" : `S/ ${i.currentPrice.toFixed(2)}`}
                      </p>
                    </div>
                    <label className="flex flex-col gap-1">
                      <span className="text-[14px] font-semibold text-[#475569]">Precio negociado (S/ por {i.unit})</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={prices[i.key] ?? ""}
                        onChange={(e) => setPrices((cur) => ({ ...cur, [i.key]: e.target.value }))}
                        className="h-12 w-[160px] border border-[#E0E0E0] rounded-xl px-3 text-[17px] outline-none focus:border-[#0F7BA8]"
                        placeholder="Sin negociar"
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </section>

          <button
            type="button"
            disabled={pending}
            onClick={guardar}
            className="min-h-14 rounded-full bg-[#0F7BA8] text-white text-[17px] font-semibold disabled:opacity-60 sm:self-start sm:px-8"
          >
            {pending ? "Guardando…" : "Guardar compra"}
          </button>
        </>
      ) : (
        <p className="text-[17px] text-[#718096] bg-white border border-[#E0E0E0] rounded-[18px] px-5 py-5">
          Aún no hay grupos. Créalos en Grupos para armar una compra conjunta.
        </p>
      )}
    </div>
  );
}
