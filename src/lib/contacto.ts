export const WHATSAPP_REGISTRO = "51901041620";

export const linkRegistroWhatsApp = (mensaje = "Hola, quiero registrarme en La Ollita") =>
  `https://wa.me/${WHATSAPP_REGISTRO}?text=${encodeURIComponent(mensaje)}`;
