import { createServerFn } from "@tanstack/react-start";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import { generateKitchenCode, isKitchenCode, isUniqueViolation } from "@/lib/reservas";

export const ensureComedorCode = createServerFn({ method: "POST" })
  .inputValidator((d: { comedor_id: string }) => {
    if (!d.comedor_id) throw new Error("Falta la olla");
    return d;
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    for (let i = 0; i < 8; i++) {
      const { data: row, error } = await supabaseAdmin
        .from("comedores")
        .select("id, code")
        .eq("id", data.comedor_id)
        .maybeSingle();
      if (error) throw new Error(friendlySupabaseError(error.message));
      if (!row) throw new Error("No encontramos esa olla");
      if (isKitchenCode(row.code)) return { code: row.code };

      const code = generateKitchenCode();
      const { error: upErr } = await supabaseAdmin
        .from("comedores")
        .update({ code })
        .eq("id", row.id);
      if (!upErr) return { code };
      if (!isUniqueViolation(upErr.message)) throw new Error(friendlySupabaseError(upErr.message));
    }

    throw new Error("No pudimos generar el código de reserva.");
  });
