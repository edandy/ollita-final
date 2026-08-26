import { describe, expect, it } from "vitest";
import { dayTotalsFromTransactions, displayDayTotals, monthProfit } from "./caja";

const ingreso = (monto: number, cajaDiaId = "hoy") => ({
  caja_dia_id: cajaDiaId,
  tipo: "ingreso" as const,
  monto,
});
const egreso = (monto: number, cajaDiaId = "hoy") => ({
  caja_dia_id: cajaDiaId,
  tipo: "egreso" as const,
  monto,
});

describe("dayTotalsFromTransactions", () => {
  it("sums income, expenses and profit", () => {
    expect(dayTotalsFromTransactions([ingreso(2.5), ingreso(10), egreso(3)])).toEqual({
      total_ingresos: 12.5,
      total_egresos: 3,
      ganancia: 9.5,
    });
  });

  it("returns zeros when there are no movements", () => {
    expect(dayTotalsFromTransactions([])).toEqual({
      total_ingresos: 0,
      total_egresos: 0,
      ganancia: 0,
    });
  });
});

describe("displayDayTotals", () => {
  const snapshot = {
    id: "hoy",
    cerrado: false,
    total_ingresos: 0,
    total_egresos: 0,
    ganancia: 0,
  };

  it("uses live transactions on an open day even if the snapshot is still zero", () => {
    expect(displayDayTotals(snapshot, [ingreso(2.5)])).toEqual({
      total_ingresos: 2.5,
      total_egresos: 0,
      ganancia: 2.5,
    });
  });

  it("keeps the closed-day snapshot and ignores later transactions", () => {
    expect(displayDayTotals({ ...snapshot, cerrado: true, total_ingresos: 8, total_egresos: 2, ganancia: 6 }, [
      ingreso(99),
    ])).toEqual({
      total_ingresos: 8,
      total_egresos: 2,
      ganancia: 6,
    });
  });
});

describe("monthProfit", () => {
  it("adds live open-day profit to closed-day snapshots", () => {
    const days = [
      { id: "ayer", cerrado: true, total_ingresos: 10, total_egresos: 4, ganancia: 6 },
      { id: "hoy", cerrado: false, total_ingresos: 0, total_egresos: 0, ganancia: 0 },
    ];
    const trx = {
      ayer: [ingreso(10, "ayer"), egreso(4, "ayer")],
      hoy: [ingreso(2.5, "hoy")],
    };
    expect(monthProfit(days, trx)).toBe(8.5);
  });
});
