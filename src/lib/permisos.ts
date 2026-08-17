export type Cargo =
  | "presidenta"
  | "vicepresidenta"
  | "tesorera"
  | "almacenera"
  | "cocinera"
  | "secretaria"
  | "fiscal"
  | "vocal"
  | "socia";

export const CARGO_LABEL: Record<Cargo, string> = {
  presidenta: "Presidenta",
  vicepresidenta: "Vicepresidenta",
  tesorera: "Tesorera",
  almacenera: "Almacenera",
  cocinera: "Cocinera",
  secretaria: "Secretaria",
  fiscal: "Fiscal",
  vocal: "Vocal",
  socia: "Socia",
};

// Cargos que solo visualizan información (no pueden registrar/editar).
export const CARGOS_SOLO_LECTURA: Cargo[] = ["socia", "fiscal", "vocal", "secretaria"];

export function esSoloLectura(cargo: Cargo | undefined): boolean {
  return !!cargo && CARGOS_SOLO_LECTURA.includes(cargo);
}

// Capacidades por cargo. Presidenta y Vicepresidenta pueden todo.
export type Accion =
  | "hoy" | "reservas" | "menu" | "insumos" | "caja" | "padron"
  | "cronograma" | "campanas" | "personal" | "perfil";

export function puede(cargo: Cargo | undefined, accion: Accion, opts?: { isSupervisor?: boolean }): boolean {
  if (opts?.isSupervisor) return accion !== "campanas";
  if (!cargo) return false;
  // Donaciones / campañas están temporalmente desactivadas
  if (accion === "campanas") return false;
  if (cargo === "presidenta" || cargo === "vicepresidenta") return true;

  const tabla: Record<Exclude<Cargo, "presidenta" | "vicepresidenta">, Accion[]> = {
    cocinera: ["hoy", "menu"],
    tesorera: ["hoy", "reservas", "caja", "padron", "cronograma"],
    almacenera: ["hoy", "insumos"],
    // Solo visualizan: ven todo menos personal/perfil.
    socia: ["hoy", "menu", "reservas", "caja", "padron", "cronograma", "insumos"],
    fiscal: ["hoy", "menu", "reservas", "caja", "padron", "cronograma", "insumos"],
    vocal: ["hoy", "menu", "reservas", "caja", "padron", "cronograma", "insumos"],
    secretaria: ["hoy", "menu", "reservas", "caja", "padron", "cronograma", "insumos"],
  };
  return tabla[cargo].includes(accion);
}