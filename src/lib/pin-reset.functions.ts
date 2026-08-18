import { createServerFn } from "@tanstack/react-start";
import { claveDePin } from "@/lib/dni-cuenta";
import { friendlySupabaseError } from "@/lib/supabase-errors";
import {
  generateResetPin,
  isPinResetRateLimited,
  matchPinResetAccount,
  peruWhatsAppNumber,
  pinResetResponse,
  validatePinResetRequest,
} from "@/lib/pin-reset";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

export const requestPinReset = createServerFn({ method: "POST" })
  .inputValidator((d: { dni: string; phone: string }) => validatePinResetRequest(d))
  .handler(async ({ data }) => {
    const { dni, phone } = data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: attempts, error: attemptError } = await supabaseAdmin
      .from("pin_reset_attempts")
      .select("dni, phone, created_at")
      .or(`dni.eq.${dni},phone.eq.${phone}`)
      .gte("created_at", since);
    if (attemptError) throw new Error(friendlySupabaseError(attemptError.message));

    const limited = isPinResetRateLimited(
      dni,
      phone,
      (attempts ?? []).map((row) => ({ dni: row.dni, phone: row.phone, createdAt: row.created_at })),
    );

    const { error: insertError } = await supabaseAdmin
      .from("pin_reset_attempts")
      .insert({ dni, phone });
    if (insertError) throw new Error(friendlySupabaseError(insertError.message));

    const [{ data: members }, { data: supervisors }] = await Promise.all([
      supabaseAdmin.from("usuarios_comedor").select("user_id, dni, telefono").eq("dni", dni).eq("telefono", phone),
      supabaseAdmin.from("supervisors").select("user_id, dni, phone").eq("dni", dni).eq("phone", phone),
    ]);

    const account = matchPinResetAccount(
      dni,
      phone,
      (members ?? []).map((row) => ({ userId: row.user_id, dni: row.dni ?? "", phone: row.telefono ?? "" })),
      (supervisors ?? []).map((row) => ({ userId: row.user_id, dni: row.dni ?? "", phone: row.phone ?? "" })),
    );
    if (!account) return pinResetResponse("not_found");
    if (limited) return pinResetResponse("rate_limited");

    const pin = generateResetPin();
    try {
      await sendWhatsAppTemplate({
        to: peruWhatsAppNumber(account.phone),
        pin,
        template: process.env.WHATSAPP_PIN_TEMPLATE || "pin_reset",
        language: process.env.WHATSAPP_PIN_TEMPLATE_LANG || "es",
      });
    } catch {
      return pinResetResponse("send_failed");
    }

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(account.userId, {
      password: claveDePin(account.dni, pin),
    });
    if (authError) return pinResetResponse("send_failed");

    return pinResetResponse("sent");
  });
