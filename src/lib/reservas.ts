const STATUS_ORDER: Record<string, number> = {
  pendiente: 0,
  no_recogida: 1,
  recogida: 2,
};

export function sortReservasForPanel<T extends { estado: string; created_at: string }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const byStatus = (STATUS_ORDER[a.estado] ?? 1) - (STATUS_ORDER[b.estado] ?? 1);
    if (byStatus !== 0) return byStatus;
    return b.created_at.localeCompare(a.created_at);
  });
}
