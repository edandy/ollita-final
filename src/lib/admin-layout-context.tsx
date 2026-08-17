import { createContext, useContext } from "react";
import type { AccessLevel } from "@/lib/access";

export type KitchenRow = {
  id: string;
  nombre: string;
  tipo: string;
  distrito: string;
  direccion: string;
  activo: boolean;
  precio_menu: number;
  raciones_diarias: number;
  telefono_whatsapp: string | null;
  yape_numero: string | null;
  socias: number;
  beneficiarios: number;
  reservas: number;
};

export type AdminConfirm = {
  titulo: string;
  texto: string;
  onConfirm: () => Promise<void> | void;
};

export type AdminLayoutValue = {
  isAdmin: boolean;
  isSupervisor: boolean;
  accessLevel: AccessLevel | null;
  kitchens: KitchenRow[];
  reloadKitchens: () => Promise<void>;
  confirm: (c: AdminConfirm) => void;
  setSubtitleCount: (n: number) => void;
  setActivityDays: (n: number) => void;
};

export const AdminLayoutContext = createContext<AdminLayoutValue | null>(null);

export function useAdminLayout() {
  const ctx = useContext(AdminLayoutContext);
  if (!ctx) throw new Error("useAdminLayout must be used within the admin layout");
  return ctx;
}
