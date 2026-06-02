"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { createEvent, type TicketTypeInput } from "../actions";

const field = "w-full rounded-xl border border-line bg-surface/60 px-4 py-2.5 text-sm outline-none transition focus:border-fuchsia/60";
const label = "mb-1.5 block text-xs text-muted";

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
    start(async () => {
      const res = await createEvent({
        title: String(f.get("title")),
        description: String(f.get("description")),
        category: String(f.get("category")),
        city: String(f.get("city")),
        region: String(f.get("region")),
        venueName: String(f.get("venueName")),
        startsAt: new Date(String(f.get("startsAt"))).toISOString(),
        endsAt: new Date(String(f.get("endsAt"))).toISOString(),
        timezone: "America/Tijuana",
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
              <input name="startsAt" type="datetime-local" required className={field} />
            </div>
            <div>
              <label className={label}>Termina *</label>
              <input name="endsAt" type="datetime-local" required className={field} />
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
                <option value="mxn">MXN</option>
                <option value="usd">USD</option>
              </select>
            </div>
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
