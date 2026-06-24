"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { createEvent, type TicketTypeInput } from "../actions";
import { CURRENCIES } from "@/lib/currencies";

const field = "w-full rounded-xl border border-line bg-surface/60 px-4 py-2.5 text-sm outline-none transition focus:border-fuchsia/60";
const label = "mb-1.5 block text-xs text-muted";

/** Convierte una hora de pared (fecha+hora) en la zona del evento a UTC ISO,
 *  sin importar la zona del navegador de quien crea el evento. */
function wallTimeToISO(dateStr: string, timeStr: string, tz: string): string {
  const naiveUTC = Date.parse(`${dateStr}T${timeStr}:00Z`); // la hora de pared como si fuera UTC
  const d = new Date(naiveUTC);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
  const offset = asUTC - d.getTime(); // cuánto difiere la zona del evento respecto a UTC
  return new Date(naiveUTC - offset).toISOString();
}

export default function NewEventPage() {
  const [tickets, setTickets] = useState<TicketTypeInput[]>([{ name: "General", price: 250, quantity: 100 }]);
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function setTicket(i: number, patch: Partial<TicketTypeInput>) {
    setTickets((t) => t.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const tz = String(f.get("timezone") || "America/Mexico_City");
    start(async () => {
      const res = await createEvent({
        title: String(f.get("title")),
        description: String(f.get("description")),
        category: String(f.get("category")),
        city: String(f.get("city")),
        region: String(f.get("region")),
        venueName: String(f.get("venueName")),
        startsAt: wallTimeToISO(String(f.get("startsDate")), String(f.get("startsTime")), tz),
        endsAt: wallTimeToISO(String(f.get("endsDate")), String(f.get("endsTime")), tz),
        timezone: tz,
        currency: String(f.get("currency")),
        orgName: String(f.get("orgName")),
        publish,
        tickets,
      });
      if (res?.error) setError(res.error);
      // si tiene éxito, el server action redirige.
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-bold">Crear evento</h1>
      <p className="mt-1 text-sm text-muted">Publica en minutos. Te quedas con más de cada boleto.</p>

      <form onSubmit={submit} className="mt-8 space-y-6">
        <Section title="Lo básico">
          <div>
            <label className={label}>Nombre del evento *</label>
            <input name="title" required placeholder="SoundWave Fest 2026" className={field} />
          </div>
          <div>
            <label className={label}>Descripción</label>
            <textarea name="description" rows={4} placeholder="Cuéntale a la gente de qué se trata…" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Categoría</label>
              <input name="category" placeholder="Música, Conferencia…" className={field} />
            </div>
            <div>
              <label className={label}>Marca / organizador</label>
              <input name="orgName" placeholder="Solo la 1ª vez" className={field} />
            </div>
          </div>
        </Section>

        <Section title="Cuándo y dónde">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Inicia *</label>
              <div className="grid grid-cols-2 gap-2">
                <input name="startsDate" type="date" required className={field} />
                <input name="startsTime" type="time" required defaultValue="18:00" className={field} />
              </div>
            </div>
            <div>
              <label className={label}>Termina *</label>
              <div className="grid grid-cols-2 gap-2">
                <input name="endsDate" type="date" required className={field} />
                <input name="endsTime" type="time" required defaultValue="21:00" className={field} />
              </div>
            </div>
          </div>
          <div>
            <label className={label}>Lugar / venue</label>
            <input name="venueName" placeholder="Pabellón Cuauhtémoc" className={field} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={label}>Ciudad</label>
              <input name="city" placeholder="Tijuana" className={field} />
            </div>
            <div>
              <label className={label}>Estado</label>
              <input name="region" placeholder="BC" className={field} />
            </div>
            <div>
              <label className={label}>Moneda</label>
              <select name="currency" defaultValue="mxn" className={field}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Zona horaria del evento</label>
            <select name="timezone" defaultValue="America/Mexico_City" className={field}>
              <option value="America/Mexico_City">México (CDMX / centro)</option>
              <option value="America/Tijuana">Tijuana / Baja California</option>
              <option value="America/Monterrey">Monterrey</option>
              <option value="America/Cancun">Cancún / Quintana Roo</option>
              <option value="America/Argentina/Buenos_Aires">Argentina</option>
              <option value="America/Bogota">Colombia</option>
              <option value="America/Lima">Perú</option>
              <option value="America/Santiago">Chile</option>
              <option value="America/Guatemala">Guatemala / Centroamérica</option>
              <option value="America/Los_Angeles">EE.UU. — Pacífico (San Diego)</option>
              <option value="America/New_York">EE.UU. — Este</option>
              <option value="Europe/Madrid">España</option>
            </select>
          </div>
        </Section>

        <Section title="Boletos">
          <div className="space-y-3">
            {tickets.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_120px_auto] items-end gap-3">
                <div>
                  {i === 0 && <label className={label}>Nombre</label>}
                  <input value={t.name} onChange={(e) => setTicket(i, { name: e.target.value })} placeholder="General" className={field} />
                </div>
                <div>
                  {i === 0 && <label className={label}>Precio</label>}
                  <input type="number" min={0} step="0.01" value={t.price} onChange={(e) => setTicket(i, { price: Number(e.target.value) })} className={field} />
                </div>
                <div>
                  {i === 0 && <label className={label}>Cantidad</label>}
                  <input type="number" min={1} value={t.quantity} onChange={(e) => setTicket(i, { quantity: Number(e.target.value) })} className={field} />
                </div>
                <button
                  type="button"
                  onClick={() => setTickets((ts) => ts.filter((_, j) => j !== i))}
                  disabled={tickets.length === 1}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-line text-muted transition hover:text-fuchsia disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setTickets((t) => [...t, { name: "", price: 0, quantity: 100 }])}
            className="mt-3 flex items-center gap-2 text-sm text-muted transition hover:text-fg"
          >
            <Plus className="h-4 w-4" /> Agregar tipo de boleto
          </button>
        </Section>

        <label className="glass flex cursor-pointer items-center gap-3 rounded-2xl p-4">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4 accent-fuchsia" />
          <span className="text-sm">Publicar ahora <span className="text-muted">(visible para vender al instante)</span></span>
        </label>

        {error && <p className="text-sm text-fuchsia">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="brand-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold text-ink transition hover:scale-[1.01] disabled:opacity-50"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {publish ? "Publicar evento" : "Guardar borrador"}
        </button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
