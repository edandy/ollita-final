import { describe, expect, it } from "vitest";
import { sortReservasForPanel } from "./reservas";

describe("sortReservasForPanel", () => {
  it("puts pendientes first and entregadas last", () => {
    const rows = [
      { id: "e1", estado: "recogida", created_at: "2026-08-17T12:00:00Z" },
      { id: "p1", estado: "pendiente", created_at: "2026-08-17T10:00:00Z" },
      { id: "n1", estado: "no_recogida", created_at: "2026-08-17T11:00:00Z" },
      { id: "p2", estado: "pendiente", created_at: "2026-08-17T13:00:00Z" },
    ];
    expect(sortReservasForPanel(rows).map((r) => r.id)).toEqual(["p2", "p1", "n1", "e1"]);
  });

  it("keeps newer reservations first within the same status", () => {
    const rows = [
      { id: "old", estado: "pendiente", created_at: "2026-08-17T08:00:00Z" },
      { id: "new", estado: "pendiente", created_at: "2026-08-17T14:00:00Z" },
    ];
    expect(sortReservasForPanel(rows).map((r) => r.id)).toEqual(["new", "old"]);
  });
});
