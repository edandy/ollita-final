export function friendlySupabaseError(message: string): string {
  const text = (message ?? "").toLowerCase();
  if (text.includes("row-level security") || text.includes("violates row-level security")) {
    return "No tienes permiso para hacer este cambio.";
  }
  if (text.includes("duplicate") || text.includes("unique")) {
    return "Ese registro ya existe.";
  }
  if (text.includes("invalid input value for enum")) {
    return "Hay un dato incompatible. Contacta al soporte si persiste.";
  }
  const looksTechnical = /violates|constraint|column|relation|permission denied|jwt|schema cache/.test(text);
  if (!text.trim() || looksTechnical) {
    return "No pudimos completar la acción. Inténtalo de nuevo.";
  }
  return message;
}
