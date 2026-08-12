// Las socias entran con su DNI y un PIN. Internamente creamos un correo técnico.
export const DOMINIO_SOCIAS = "socias.laollita.pe";

export function emailDeDni(dni: string) {
  return `${dni.trim()}@${DOMINIO_SOCIAS}`;
}

export function esDni(valor: string) {
  return /^\d{8}$/.test(valor.trim());
}

export function validarPin(pin: string) {
  if (!/^\d{4,8}$/.test(pin.trim())) throw new Error("El PIN debe tener entre 4 y 8 números");
  return pin.trim();
}

// La contraseña real combina el PIN y el DNI para cumplir el mínimo de caracteres.
export function claveDePin(dni: string, pin: string) {
  return `${pin.trim()}-${dni.trim()}`;
}
