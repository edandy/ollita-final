import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useMiComedor() {
  const [vinculo, setVinculo] = useState<any>(null);
  const [comedor, setComedor] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const recargar = useCallback(async () => {
    const { data: ud } = await supabase.auth.getUser();
    if (!ud.user) { setLoading(false); return; }

    // El administrador de la plataforma puede entrar al panel de cualquier olla.
    const elegido = typeof window !== "undefined" ? window.localStorage.getItem("admin_comedor_id") : null;
    if (elegido) {
      const { data: rol } = await supabase.from("user_roles")
        .select("role").eq("user_id", ud.user.id).eq("role", "admin").maybeSingle();
      if (rol) {
        const { data: c } = await supabase.from("comedores").select("*").eq("id", elegido).maybeSingle();
        if (c) {
          setComedor(c);
          setVinculo({ id: "admin", user_id: ud.user.id, comedor_id: c.id, nombre: "Administración", cargo: "presidenta", esAdmin: true });
          setLoading(false);
          return;
        }
      }
      window.localStorage.removeItem("admin_comedor_id");
    }

    const { data: v } = await supabase
      .from("usuarios_comedor")
      .select("*, comedor:comedores(*)")
      .eq("user_id", ud.user.id)
      .maybeSingle();
    if (v) { setVinculo(v); setComedor((v as any).comedor); }
    setLoading(false);
  }, []);

  useEffect(() => { recargar(); }, [recargar]);

  return { vinculo, comedor, loading, recargar };
}