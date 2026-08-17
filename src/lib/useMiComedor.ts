import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ADMIN_KITCHEN_STORAGE_KEY, SUPERVISOR_KITCHEN_STORAGE_KEY, type AccessLevel } from "@/lib/access";
import { esSoloLectura, type Cargo } from "@/lib/permisos";

export function useMiComedor() {
  const [vinculo, setVinculo] = useState<any>(null);
  const [comedor, setComedor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [platformRole, setPlatformRole] = useState<"admin" | "supervisor" | "member" | null>(null);

  const recargar = useCallback(async () => {
    const { data: ud } = await supabase.auth.getUser();
    if (!ud.user) { setLoading(false); return; }

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", ud.user.id);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    const isSupervisor = (roles ?? []).some((r) => r.role === "supervisor");

    const adminElegido = typeof window !== "undefined" ? window.localStorage.getItem(ADMIN_KITCHEN_STORAGE_KEY) : null;
    if (adminElegido && isAdmin) {
      const { data: c } = await supabase.from("comedores").select("*").eq("id", adminElegido).maybeSingle();
      if (c) {
        setComedor(c);
        setVinculo({
          id: "admin", user_id: ud.user.id, comedor_id: c.id, nombre: "Administración",
          cargo: "presidenta", esAdmin: true, esSupervisor: false, accessLevel: "full", esSoloLectura: false,
        });
        setPlatformRole("admin");
        setLoading(false);
        return;
      }
      window.localStorage.removeItem(ADMIN_KITCHEN_STORAGE_KEY);
    }

    const supervisorElegido = typeof window !== "undefined" ? window.localStorage.getItem(SUPERVISOR_KITCHEN_STORAGE_KEY) : null;
    if (isSupervisor) {
      setPlatformRole("supervisor");
      if (supervisorElegido) {
        const { data: assignment } = await supabase
          .from("supervisor_assignments")
          .select("comedor_id")
          .eq("user_id", ud.user.id)
          .eq("comedor_id", supervisorElegido)
          .maybeSingle();
        const { data: profile } = await supabase
          .from("supervisors")
          .select("name, access_level")
          .eq("user_id", ud.user.id)
          .maybeSingle();
        if (assignment && profile) {
          const { data: c } = await supabase.from("comedores").select("*").eq("id", supervisorElegido).maybeSingle();
          if (c) {
            const accessLevel = profile.access_level as AccessLevel;
            setComedor(c);
            setVinculo({
              id: "supervisor",
              user_id: ud.user.id,
              comedor_id: c.id,
              nombre: profile.name,
              cargo: accessLevel === "full" ? "presidenta" : "socia",
              esAdmin: false,
              esSupervisor: true,
              accessLevel,
              esSoloLectura: accessLevel === "view",
            });
            setLoading(false);
            return;
          }
        }
        window.localStorage.removeItem(SUPERVISOR_KITCHEN_STORAGE_KEY);
      }
      setVinculo(null);
      setComedor(null);
      setLoading(false);
      return;
    }

    const { data: v } = await supabase
      .from("usuarios_comedor")
      .select("*, comedor:comedores(*)")
      .eq("user_id", ud.user.id)
      .maybeSingle();
    if (v) {
      setVinculo({ ...v, esSoloLectura: esSoloLectura(v.cargo as Cargo) });
      setComedor((v as any).comedor);
      setPlatformRole("member");
    } else if (isAdmin) {
      setPlatformRole("admin");
    }
    setLoading(false);
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  return { vinculo, comedor, loading, recargar, platformRole };
}
