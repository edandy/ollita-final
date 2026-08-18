export type PinResetWhatsAppInput = {
  to: string;
  pin: string;
  template: string;
  language: string;
};

export function buildPinResetWhatsAppPayload(input: PinResetWhatsAppInput) {
  const pinParam = { type: "text" as const, text: input.pin };
  return {
    messaging_product: "whatsapp" as const,
    recipient_type: "individual" as const,
    to: input.to,
    type: "template" as const,
    template: {
      name: input.template,
      language: { code: input.language },
      components: [
        {
          type: "body" as const,
          parameters: [pinParam],
        },
        {
          type: "button" as const,
          sub_type: "url" as const,
          index: "0",
          parameters: [pinParam],
        },
      ],
    },
  };
}

export async function sendWhatsAppTemplate(input: PinResetWhatsAppInput) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) throw new Error("Falta la configuración de WhatsApp.");

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPinResetWhatsAppPayload(input)),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `WhatsApp ${res.status}`);
  }
}
