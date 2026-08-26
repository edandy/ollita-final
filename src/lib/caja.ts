export type CajaDaySnapshot = {
  id: string;
  cerrado: boolean;
  total_ingresos: number;
  total_egresos: number;
  ganancia: number;
};

export type CajaMovement = {
  tipo: "ingreso" | "egreso";
  monto: number;
};

export type CajaDayTotals = {
  total_ingresos: number;
  total_egresos: number;
  ganancia: number;
};

export function dayTotalsFromTransactions(trx: CajaMovement[]): CajaDayTotals {
  const total_ingresos = trx
    .filter((t) => t.tipo === "ingreso")
    .reduce((s, t) => s + Number(t.monto), 0);
  const total_egresos = trx
    .filter((t) => t.tipo === "egreso")
    .reduce((s, t) => s + Number(t.monto), 0);
  return { total_ingresos, total_egresos, ganancia: total_ingresos - total_egresos };
}

export function displayDayTotals(cajaDia: CajaDaySnapshot, trxDelDia: CajaMovement[]): CajaDayTotals {
  if (cajaDia.cerrado) {
    return {
      total_ingresos: Number(cajaDia.total_ingresos),
      total_egresos: Number(cajaDia.total_egresos),
      ganancia: Number(cajaDia.ganancia),
    };
  }
  return dayTotalsFromTransactions(trxDelDia);
}

export function monthProfit(
  days: CajaDaySnapshot[],
  trxByDay: Record<string, CajaMovement[]>,
) {
  return days.reduce((sum, day) => sum + displayDayTotals(day, trxByDay[day.id] ?? []).ganancia, 0);
}
