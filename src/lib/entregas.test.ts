import { describe, expect, it } from "vitest";
import {
  deliveryAmount,
  deliveryBlockReason,
  ENTREGAS_MSG,
  maxServings,
  shouldOpenDebt,
  shouldPostCajaIncome,
  walkInNameOk,
  type DeliveryPayMethod,
} from "./entregas";

describe("deliveryAmount", () => {
  it("multiplies menu price by servings", () => {
    expect(deliveryAmount(5, 3)).toBe(15);
    expect(deliveryAmount(4.5, 2)).toBe(9);
  });

  it("returns 0 for invalid price or servings", () => {
    expect(deliveryAmount(-1, 2)).toBe(0);
    expect(deliveryAmount(5, 0)).toBe(0);
    expect(deliveryAmount(Number.NaN, 2)).toBe(0);
  });
});

describe("maxServings", () => {
  it("caps at 6 even if more raciones are free", () => {
    expect(maxServings({ available: 20, cap: 6 })).toBe(6);
  });

  it("does not exceed leftover raciones", () => {
    expect(maxServings({ available: 2, cap: 6 })).toBe(2);
  });

  it("respects kitchen max per reservation", () => {
    expect(maxServings({ available: 10, cap: 6, kitchenMax: 4 })).toBe(4);
  });

  it("returns 0 when nothing is left", () => {
    expect(maxServings({ available: 0, cap: 6 })).toBe(0);
    expect(maxServings({ available: -3, cap: 6 })).toBe(0);
  });
});

describe("pago efectivo/Yape vs deuda", () => {
  const paid: DeliveryPayMethod[] = ["efectivo", "yape"];

  it("posts caja income only for efectivo and Yape", () => {
    for (const method of paid) {
      expect(shouldPostCajaIncome(method)).toBe(true);
      expect(shouldOpenDebt(method)).toBe(false);
    }
  });

  it("opens a debt and skips caja when the person debe", () => {
    expect(shouldPostCajaIncome("debe")).toBe(false);
    expect(shouldOpenDebt("debe")).toBe(true);
  });
});

describe("mensajes de entregas", () => {
  it("explains missing menu and leftover raciones in Spanish", () => {
    expect(deliveryBlockReason({ hasMenu: false, available: 10 })).toBe(ENTREGAS_MSG.noMenu);
    expect(deliveryBlockReason({ hasMenu: true, available: 0 })).toBe(ENTREGAS_MSG.noServings);
    expect(deliveryBlockReason({ hasMenu: true, available: 4 })).toBeNull();
  });

  it("has Spanish copy for caja and paid debt", () => {
    expect(ENTREGAS_MSG.cajaMissing).toMatch(/caja/i);
    expect(ENTREGAS_MSG.debtPaid).toMatch(/pagó/i);
    expect(ENTREGAS_MSG.deliveryOk).toBe("Listo, se entregó.");
  });

  it("rejects a walk-in without a real name", () => {
    expect(walkInNameOk("")).toBe(false);
    expect(walkInNameOk("  A  ")).toBe(false);
    expect(walkInNameOk("Rosa")).toBe(true);
  });
});
