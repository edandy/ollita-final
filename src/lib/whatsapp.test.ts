import { describe, expect, it } from "vitest";
import { buildPinResetWhatsAppPayload } from "./whatsapp";

describe("buildPinResetWhatsAppPayload", () => {
  it("builds an Authentication template with the PIN in body and copy-code button", () => {
    expect(buildPinResetWhatsAppPayload({
      to: "51987654321",
      pin: "123456",
      template: "pin_reset",
      language: "es",
    })).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "51987654321",
      type: "template",
      template: {
        name: "pin_reset",
        language: { code: "es" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "123456" }],
          },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: "123456" }],
          },
        ],
      },
    });
  });
});
