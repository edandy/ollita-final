import { Link } from "@tanstack/react-router";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCanWrite, useKitchenAccess } from "@/lib/kitchen-access-context";

export { useCanWrite, useKitchenAccess };

export function PanelWriteGate({ children }: { children: ReactNode }) {
  const canWrite = useCanWrite();
  if (!canWrite) return null;
  return <>{children}</>;
}

export function PanelShell({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[780px] mx-auto px-6 py-6 pb-10 flex flex-col gap-5">
      {children}
    </div>
  );
}

export function PanelBack({ to = "/panel/mas" }: { to?: string }) {
  return (
    <Link
      to={to}
      className="self-start min-h-12 px-4 pl-2 gap-1.5 inline-flex items-center rounded-full text-[#0F7BA8] text-base font-semibold hover:bg-terracota-suave"
    >
      <ArrowLeft size={22} /> Más opciones
    </Link>
  );
}

export function PanelTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap">
      <div className="flex flex-col gap-0.5 min-w-0">
        <h2 className="text-[28px] font-bold text-bosque tracking-[-0.02em] leading-tight">{title}</h2>
        {subtitle && <p className="text-base text-[#718096]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PanelCta({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  loading,
  loadingText = "Guardando…",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "navy" | "outline" | "danger" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  className?: string;
}) {
  const canWrite = useCanWrite();
  if (!canWrite) return null;
  const blocked = disabled || loading;
  const styles = {
    primary: "bg-[#0F7BA8] text-white shadow-[0_4px_16px_rgba(15,123,168,0.30)] hover:bg-[#0A5F82] border-0",
    secondary: "bg-white text-[#0F7BA8] border border-[#0F7BA8] hover:bg-terracota-suave",
    navy: "bg-bosque text-white border-0 hover:bg-[#0A2E5E]",
    outline: "bg-white text-[#475569] border border-[#E0E0E0] hover:border-[#0F7BA8]",
    danger: "bg-[#FDECEA] text-[#C5352B] border-0 hover:bg-[#F9D8D4]",
    ghost: "bg-transparent text-[#C5352B] border-0 hover:bg-[#FDECEA]",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={blocked}
      className={`min-h-[58px] px-5 inline-flex items-center justify-center gap-2 rounded-full text-[17px] font-semibold disabled:opacity-50 ${styles} ${className}`}
    >
      {loading ? loadingText : children}
    </button>
  );
}

export function PanelCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-[#E0E0E0] rounded-[20px] p-[22px] flex flex-col gap-4 ${className}`}>
      {children}
    </div>
  );
}

export function PanelChip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-12 px-4 rounded-full text-base font-semibold ${
        active ? "bg-terracota-suave text-bosque" : "bg-white border border-[#E0E0E0] text-[#718096]"
      }`}
    >
      {children}
    </button>
  );
}

export function PanelField({
  label,
  children,
  note,
}: {
  label: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[15px] font-semibold text-bosque">{label}</span>
      {children}
      {note && <span className="text-sm text-[#718096]">{note}</span>}
    </label>
  );
}

export function panelInputClass(extra = "") {
  return `h-14 w-full border border-[#E0E0E0] rounded-xl px-4 text-[17px] bg-white outline-none focus:border-[#0F7BA8] ${extra}`;
}

export function PanelOverlay({
  children,
  onClose,
  maxWidth = "max-w-[520px]",
}: {
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[rgba(7,34,73,0.55)] flex items-end sm:items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto bg-white rounded-[20px] p-7 flex flex-col gap-5 shadow-[0_12px_40px_rgba(7,34,73,0.30)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function PanelIconBox({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="size-[52px] rounded-[14px] bg-terracota-suave text-bosque grid place-items-center shrink-0">
      <Icon size={24} />
    </div>
  );
}
