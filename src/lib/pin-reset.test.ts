import { describe, expect, it } from "vitest";
import {
  PIN_RESET_NOT_FOUND,
  PIN_RESET_RATE_LIMITED,
  PIN_RESET_SEND_FAILED,
  PIN_RESET_SENT,
  generateResetPin,
  isPinResetRateLimited,
  matchPinResetAccount,
  peruWhatsAppNumber,
  pinResetResponse,
  validatePinResetRequest,
} from "./pin-reset";

describe("validatePinResetRequest", () => {
  it("trims and accepts a DNI and 9-digit phone", () => {
    expect(validatePinResetRequest({ dni: " 12345678 ", phone: "987654321" })).toEqual({
      dni: "12345678",
      phone: "987654321",
    });
  });

  it("rejects a malformed DNI or phone with a friendly message", () => {
    expect(() => validatePinResetRequest({ dni: "123", phone: "987654321" })).toThrow(/DNI debe tener 8/);
    expect(() => validatePinResetRequest({ dni: "12345678", phone: "98765" })).toThrow(/celular debe tener 9/);
  });
});

describe("generateResetPin", () => {
  it("returns 6 digits", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateResetPin()).toMatch(/^\d{6}$/);
    }
  });
});

describe("matchPinResetAccount", () => {
  const member = { userId: "u-kitchen", dni: "12345678", phone: "987654321" };
  const supervisor = { userId: "u-super", dni: "87654321", phone: "912345678" };

  it("matches a kitchen member by DNI and phone", () => {
    expect(matchPinResetAccount("12345678", "987654321", [member], [supervisor])).toEqual(member);
  });

  it("matches a supervisor by DNI and phone", () => {
    expect(matchPinResetAccount("87654321", "912345678", [member], [supervisor])).toEqual(supervisor);
  });

  it("returns null when the phone does not match", () => {
    expect(matchPinResetAccount("12345678", "911111111", [member], [])).toBeNull();
  });

  it("returns null when two different accounts match", () => {
    const other = { userId: "u-other", dni: "12345678", phone: "987654321" };
    expect(matchPinResetAccount("12345678", "987654321", [member, other], [])).toBeNull();
  });

  it("matches when the same user appears twice", () => {
    expect(matchPinResetAccount("12345678", "987654321", [member, { ...member, userId: "u-kitchen" }], [])).toEqual(member);
  });
});

describe("isPinResetRateLimited", () => {
  const now = new Date("2026-08-18T18:00:00Z");

  it("blocks a second request within 15 minutes", () => {
    expect(isPinResetRateLimited("12345678", "987654321", [
      { dni: "12345678", phone: "987654321", createdAt: "2026-08-18T17:50:00Z" },
    ], now)).toBe(true);
  });

  it("blocks a fourth request in 24 hours", () => {
    expect(isPinResetRateLimited("12345678", "987654321", [
      { dni: "12345678", phone: "111111111", createdAt: "2026-08-18T10:00:00Z" },
      { dni: "00000000", phone: "987654321", createdAt: "2026-08-18T12:00:00Z" },
      { dni: "12345678", phone: "987654321", createdAt: "2026-08-17T20:00:00Z" },
    ], now)).toBe(true);
  });

  it("allows a first request", () => {
    expect(isPinResetRateLimited("12345678", "987654321", [], now)).toBe(false);
  });
});

describe("peruWhatsAppNumber", () => {
  it("prefixes 51", () => {
    expect(peruWhatsAppNumber("987654321")).toBe("51987654321");
  });
});

describe("pinResetResponse", () => {
  it("tells the user when the account was not found", () => {
    expect(pinResetResponse("not_found")).toEqual({
      ok: false,
      sent: false,
      message: PIN_RESET_NOT_FOUND,
    });
    expect(PIN_RESET_NOT_FOUND.toLowerCase()).toMatch(/no encontramos/);
  });

  it("confirms the PIN was sent by WhatsApp and how to sign in", () => {
    expect(pinResetResponse("sent")).toEqual({
      ok: true,
      sent: true,
      message: PIN_RESET_SENT,
    });
    expect(PIN_RESET_SENT.toLowerCase()).toMatch(/whatsapp/);
    expect(PIN_RESET_SENT.toLowerCase()).toMatch(/pin/);
  });

  it("asks them to wait if they already requested a PIN", () => {
    expect(pinResetResponse("rate_limited")).toMatchObject({
      ok: true,
      sent: true,
      message: PIN_RESET_RATE_LIMITED,
    });
  });

  it("lets them retry when WhatsApp did not go out", () => {
    expect(pinResetResponse("send_failed")).toMatchObject({
      ok: false,
      sent: false,
      message: PIN_RESET_SEND_FAILED,
    });
  });
});
