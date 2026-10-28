import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { Fragment, useId } from "react";
import { cn } from "@/lib/utils";

export type AdminSelectOption = {
  value: string;
  label: string;
  /** Second line under the label, e.g. how often a report comes out. */
  hint?: string;
  /** Short code shown as a navy pill, e.g. "G11". */
  badge?: string;
  /** Options with the same group are listed together under that title. */
  group?: string;
};

// Radix Select reserves the empty string for "no value"; our selects use it as a real choice.
const EMPTY = "__empty";
const toRadix = (v: string) => (v === "" ? EMPTY : v);
const fromRadix = (v: string) => (v === EMPTY ? "" : v);

function Badge({ children }: { children: string }) {
  return (
    <span className="inline-flex h-6 min-w-[38px] shrink-0 items-center justify-center rounded-md bg-[#072249] px-1.5 text-[13px] font-bold tabular-nums text-white">
      {children}
    </span>
  );
}

function OptionContent({ option, trigger }: { option: AdminSelectOption; trigger?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {option.badge && <Badge>{option.badge}</Badge>}
      <span className="flex min-w-0 flex-col text-left">
        <span className={cn("truncate text-[17px] text-[#072249]", trigger ? "font-semibold" : "font-medium")}>
          {option.label}
        </span>
        {option.hint && <span className="truncate text-[14px] leading-[18px] text-[#475569]">{option.hint}</span>}
      </span>
    </span>
  );
}

export function AdminSelect({
  label,
  value,
  onValueChange,
  options,
  placeholder = "Elige una opción",
  disabled,
  required,
  size,
  className,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: AdminSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Keeps native form validation: Radix renders a hidden required select. */
  required?: boolean;
  /** "lg" makes the trigger as tall as one with a hint, to line up a row of filters. */
  size?: "md" | "lg";
  className?: string;
}) {
  const id = useId();
  const selected = options.find((o) => o.value === value);
  const tall = size === "lg" || options.some((o) => o.hint);
  const groups = [...new Set(options.map((o) => o.group ?? ""))];

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[15px] font-semibold text-bosque">
        {label}
      </label>
      <SelectPrimitive.Root
        value={selected ? toRadix(value) : undefined}
        onValueChange={(v) => onValueChange(fromRadix(v))}
        disabled={disabled || options.length === 0}
        required={required}
      >
        <SelectPrimitive.Trigger
          id={id}
          className={cn(
            "group flex w-full items-center justify-between gap-3 rounded-xl border border-[#E0E0E0] bg-white pl-4 pr-2 text-left outline-none transition-colors",
            tall ? "min-h-[64px] py-2" : "h-14",
            "hover:border-[#9197B3] focus-visible:border-[#0F7BA8] focus-visible:ring-2 focus-visible:ring-[#0F7BA8]/25",
            "data-[state=open]:border-[#0F7BA8] data-[state=open]:ring-2 data-[state=open]:ring-[#0F7BA8]/25",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {selected ? (
            <OptionContent option={selected} trigger />
          ) : (
            <span className="truncate text-[17px] text-[#718096]">{placeholder}</span>
          )}
          <span className="grid size-8 shrink-0 place-items-center rounded-lg text-[#475569] group-hover:bg-[#F0F0F0]">
            <ChevronDown size={20} className="transition-transform duration-150 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
          </span>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            collisionPadding={16}
            className="z-50 max-h-[min(420px,var(--radix-select-content-available-height))] min-w-[max(240px,var(--radix-select-trigger-width))] overflow-hidden rounded-2xl border border-[#E0E0E0] bg-white shadow-[0_12px_32px_rgba(7,34,73,0.16)]"
          >
            <SelectPrimitive.Viewport className="p-1.5">
              {groups.map((group, gi) => {
                const items = options.filter((o) => (o.group ?? "") === group);
                const content = items.map((o) => (
                  <SelectPrimitive.Item
                    key={o.value || EMPTY}
                    value={toRadix(o.value)}
                    className="relative flex min-h-12 cursor-pointer select-none items-center justify-between gap-3 rounded-lg px-3 py-2 outline-none data-[highlighted]:bg-[#C5EBF9] data-[state=checked]:bg-[#E8F6FC] data-[highlighted]:data-[state=checked]:bg-[#C5EBF9]"
                  >
                    <SelectPrimitive.ItemText asChild>
                      <span className="min-w-0">
                        <OptionContent option={{ ...o, hint: undefined }} />
                      </span>
                    </SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <Check size={18} strokeWidth={2.5} className="text-[#0F7BA8]" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ));
                if (!group) return <Fragment key={`g${gi}`}>{content}</Fragment>;
                return (
                  <SelectPrimitive.Group key={group} className={gi > 0 ? "mt-1.5 border-t border-[#E0E0E0] pt-1.5" : undefined}>
                    <SelectPrimitive.Label className="px-3 pb-1 pt-1.5 text-[13px] font-semibold text-[#475569]">
                      {group}
                    </SelectPrimitive.Label>
                    {content}
                  </SelectPrimitive.Group>
                );
              })}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
