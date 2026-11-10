"use client";

import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";

/** Primitivas visuales del módulo de Protocolo (reutilizan el sistema visual actual). */
export const inputCls =
  "w-full rounded-xl border border-line bg-surface/60 px-3.5 py-2.5 text-sm outline-none transition focus:border-fuchsia/60 disabled:opacity-50";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted/80">{hint}</span>}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputCls} ${props.className ?? ""}`}>
      {children}
    </select>
  );
}

/** Grupo de opciones tipo "pastilla" accesible por teclado (radio nativo). */
export function Choice<T extends string>({
  name, value, options, onChange, disabled,
}: { name: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o.value}
          className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition focus-within:ring-2 focus-within:ring-fuchsia/50 ${
            value === o.value ? "border-fuchsia/70 bg-fuchsia/10 text-fg" : "border-line text-muted hover:border-white/20"
          } ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} disabled={disabled} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function Badge({ tone = "muted", children }: { tone?: "muted" | "ok" | "warn" | "bad" | "gold"; children: ReactNode }) {
  const cls = {
    muted: "bg-surface-2 text-muted",
    ok: "bg-emerald-500/10 text-emerald-300",
    warn: "bg-amber-500/10 text-amber-300",
    bad: "bg-rose-500/10 text-rose-300",
    gold: "bg-gold/10 text-gold",
  }[tone];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export function Button({
  children, variant = "ghost", ...props
}: { variant?: "primary" | "ghost" | "danger" } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = {
    primary: "brand-gradient font-semibold text-ink hover:scale-[1.02]",
    ghost: "border border-line hover:border-white/20",
    danger: "border border-rose-500/40 text-rose-300 hover:bg-rose-500/10",
  }[variant];
  return (
    <button type="button" {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm transition disabled:pointer-events-none disabled:opacity-50 ${cls} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}
