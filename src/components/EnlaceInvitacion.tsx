import { useState } from "react";
import { Copy } from "lucide-react";

export function EnlaceInvitacion({ enlace }: { enlace: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[15px] text-[#718096]">
        Comparte este enlace. Vence en 14 días y solo se puede usar una vez.
      </p>
      <div className="flex gap-2.5">
        <input
          readOnly
          value={enlace}
          className="flex-1 h-14 px-4 border border-[#E0E0E0] rounded-xl text-[15px] text-[#072249] outline-none min-w-0"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(enlace);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}
          className="size-14 grid place-items-center rounded-xl bg-[#0F7BA8] text-white shrink-0 hover:bg-[#0A5F82]"
          aria-label="Copiar enlace"
        >
          <Copy size={20} strokeWidth={1.75} />
        </button>
      </div>
      {copiado && <p className="text-[15px] text-[#0F7BA8] font-semibold">Enlace copiado</p>}
      <a
        href={`https://wa.me/?text=${encodeURIComponent("Te invito a La Ollita: " + enlace)}`}
        target="_blank"
        rel="noreferrer"
        className="text-center text-[16px] font-semibold text-[#0F7BA8] py-1"
      >
        Enviar por WhatsApp
      </a>
    </div>
  );
}
