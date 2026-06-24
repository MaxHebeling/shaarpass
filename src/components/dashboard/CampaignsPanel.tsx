"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, Clock, Loader2, Plus, Trash2, Monitor, Smartphone, Users, Check } from "lucide-react";
import { sendCampaign2, scheduleCampaign, sendTestCampaign, deleteCampaign, getCampaignCountryMetrics, type CampaignForm } from "@/app/dashboard/actions";
import { ChevronDown, Globe } from "lucide-react";
import { wallTimeToISO, EVENT_TIMEZONES } from "@/lib/datetime";
import type { Segment } from "@/lib/email/campaignSend";

export interface CampaignRow {
  id: string; name: string; subject: string; status: string;
  scheduled_at: string | null; recipients_count: number; sent_count: number; created_at: string;
  delivered_count?: number; opened_count?: number; clicked_count?: number; bounced_count?: number; unsub_count?: number;
}
interface TT { id: string; name: string; }

const VARS = ["firstName", "lastName", "email", "country", "eventName", "eventDate", "ticketType"];
const STATUS_OPTS = [
  { v: "paid", label: "Pagados / Registrados" },
  { v: "pending", label: "Pendientes de pago" },
  { v: "checked_in", label: "Check-in realizado" },
  { v: "not_checked_in", label: "No asistieron" },
];
const field = "w-full rounded-xl border border-line bg-surface/60 px-3 py-2.5 text-sm outline-none focus:border-fuchsia/60";

export function CampaignsPanel({ eventId, defaultTz, ticketTypes, countries, registrants, initial }: {
  eventId: string; defaultTz: string; ticketTypes: TT[]; countries: string[]; registrants: { email: string; name: string }[]; initial: CampaignRow[];
}) {
  const [open, setOpen] = useState(initial.length === 0);
  const [campaigns, setCampaigns] = useState(initial);
  const router = useRouter();

  return (
    <div className="glass rounded-3xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Mail className="h-5 w-5 text-gold" /> Campañas de email</h2>
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full border border-line px-3.5 py-2 text-sm font-medium transition hover:border-white/20">
          <Plus className="h-4 w-4" /> Nueva campaña
        </button>
      </div>

      {open && (
        <Builder eventId={eventId} defaultTz={defaultTz} ticketTypes={ticketTypes} countries={countries} registrants={registrants}
          onDone={() => { setOpen(false); router.refresh(); }} />
      )}

      {/* Historial */}
      <div className="mt-5">
        <div className="mb-2 text-xs font-medium text-muted">Historial</div>
        {campaigns.length === 0 ? (
          <p className="text-sm text-muted">Aún no has creado campañas.</p>
        ) : (
          <div className="space-y-2">
            {campaigns.map((c) => (
              <div key={c.id} className="rounded-2xl border border-line bg-surface/40 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted">{c.subject}</div>
                    <div className="mt-0.5 text-[11px] text-muted/70">
                      {c.status === "sent" ? `Enviada · ${c.sent_count}/${c.recipients_count}` :
                       c.status === "scheduled" ? `Programada · ${c.scheduled_at ? new Date(c.scheduled_at).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}` :
                       c.status === "sending" ? "Enviando…" : c.status === "failed" ? "Falló" : "Borrador"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CampaignStatus status={c.status} />
                    <button onClick={async () => { if (confirm(`¿Eliminar la campaña "${c.name}"?`)) { await deleteCampaign({ id: c.id, eventId }); setCampaigns((a) => a.filter((x) => x.id !== c.id)); router.refresh(); } }}
                      aria-label="Eliminar" className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition hover:border-rose-500/50 hover:text-rose-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {c.status === "sent" && <CampaignMetrics c={c} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Builder({ eventId, defaultTz, ticketTypes, countries, registrants, onDone }: {
  eventId: string; defaultTz: string; ticketTypes: TT[]; countries: string[]; registrants: { email: string; name: string }[]; onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [body, setBody] = useState("Hola {{firstName}},\n\n");
  const [segType, setSegType] = useState<Segment["type"]>("all");
  const [selCountries, setSelCountries] = useState<string[]>([]);
  const [selTypes, setSelTypes] = useState<string[]>([]);
  const [selStatuses, setSelStatuses] = useState<string[]>(["paid"]);
  const [selEmails, setSelEmails] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [when, setWhen] = useState<"now" | "schedule">("now");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [tz, setTz] = useState(defaultTz || "America/Mexico_City");
  const [preview, setPreview] = useState<"desktop" | "mobile">("desktop");
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const segment: Segment = { type: segType, countries: selCountries, ticketTypes: selTypes, statuses: selStatuses, emails: selEmails };
  const form: CampaignForm = { eventId, name, subject, preheader, fromName, replyTo, bodyHtml: body, segment };

  const filteredReg = useMemo(() => q.trim().length < 2 ? [] : registrants.filter((r) =>
    (r.name + " " + r.email).toLowerCase().includes(q.toLowerCase())).slice(0, 8), [q, registrants]);

  const previewHtml = body
    .replace(/\{\{firstName\}\}/g, "María").replace(/\{\{lastName\}\}/g, "González")
    .replace(/\{\{eventName\}\}/g, "tu evento").replace(/\{\{ticketType\}\}/g, "General")
    .replace(/\{\{country\}\}/g, "México").replace(/\{\{email\}\}/g, "maria@correo.com")
    .replace(/\n/g, "<br/>");

  function validate(): string | null {
    if (!name.trim() || !subject.trim()) return "Nombre y asunto son obligatorios";
    if (!body.trim()) return "El cuerpo no puede estar vacío";
    if (when === "schedule" && (!date || !time)) return "Elige fecha y hora";
    return null;
  }

  function submit() {
    const v = validate(); if (v) { setErr(v); return; }
    setErr(null); setMsg(null);
    start(async () => {
      if (when === "now") {
        const res = await sendCampaign2(form);
        if ("error" in res && res.error) { setErr(res.error); return; }
        const ok = res as { sent: number; recipients: number; reason?: string };
        setMsg(ok.reason === "no_key" ? `Guardada, pero falta Resend (0 de ${ok.recipients}).` : `✅ Enviada a ${ok.sent} de ${ok.recipients} destinatarios.`);
      } else {
        const scheduledAt = wallTimeToISO(date, time, tz);
        const res = await scheduleCampaign({ ...form, scheduledAt, timezone: tz });
        if ("error" in res && res.error) { setErr(res.error); return; }
        setMsg("✅ Campaña programada. Se enviará automáticamente.");
      }
      setTimeout(onDone, 1200);
    });
  }

  function sendTest() {
    if (!testTo) { setErr("Escribe un correo para la prueba"); return; }
    setErr(null); setMsg(null);
    start(async () => {
      const res = await sendTestCampaign({ eventId, to: testTo, subject, preheader, bodyHtml: body, fromName, replyTo });
      setMsg(res?.error ? res.error : `✉️ Prueba enviada a ${testTo}`);
    });
  }

  return (
    <div className="rounded-2xl border border-line bg-surface/30 p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Columna izquierda: contenido + destinatarios + programación */}
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-xs text-muted">Nombre interno *</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Recordatorio 7 días" className={field} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><div className="mb-1.5 text-xs text-muted">Remitente</div><input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Tu organización" className={field} /></div>
            <div><div className="mb-1.5 text-xs text-muted">Responder a</div><input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="correo@org.com" className={field} /></div>
          </div>
          <div><div className="mb-1.5 text-xs text-muted">Asunto *</div><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del correo" className={field} /></div>
          <div><div className="mb-1.5 text-xs text-muted">Preheader</div><input value={preheader} onChange={(e) => setPreheader(e.target.value)} placeholder="Texto de vista previa (opcional)" className={field} /></div>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              Cuerpo *
              {VARS.map((v) => <button key={v} type="button" onClick={() => setBody((b) => b + `{{${v}}}`)} className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-fg/80 hover:text-fuchsia">{`{{${v}}}`}</button>)}
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={field} />
            <p className="mt-1 text-[11px] text-muted">Puedes usar HTML. Las variables se reemplazan por cada destinatario.</p>
          </div>

          {/* Destinatarios */}
          <div className="rounded-xl border border-line bg-surface/40 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium"><Users className="h-3.5 w-3.5 text-gold" /> Destinatarios</div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {([["all", "Todos"], ["country", "Por país"], ["ticket_type", "Por boleto"], ["status", "Por estado"], ["manual", "Manual"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setSegType(v)} className={`rounded-full px-3 py-1.5 transition ${segType === v ? "brand-gradient text-ink" : "border border-line text-muted hover:text-fg"}`}>{l}</button>
              ))}
            </div>
            {segType === "country" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {countries.length === 0 ? <span className="text-xs text-muted">Sin países registrados.</span> :
                  countries.map((c) => <Chip key={c} on={selCountries.includes(c)} onClick={() => toggle(selCountries, c, setSelCountries)}>{c}</Chip>)}
              </div>
            )}
            {segType === "ticket_type" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ticketTypes.map((t) => <Chip key={t.id} on={selTypes.includes(t.id)} onClick={() => toggle(selTypes, t.id, setSelTypes)}>{t.name}</Chip>)}
              </div>
            )}
            {segType === "status" && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {STATUS_OPTS.map((s) => <Chip key={s.v} on={selStatuses.includes(s.v)} onClick={() => toggle(selStatuses, s.v, setSelStatuses)}>{s.label}</Chip>)}
              </div>
            )}
            {segType === "manual" && (
              <div className="mt-3">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo" className={field} />
                {filteredReg.map((r) => (
                  <button key={r.email} onClick={() => { if (!selEmails.includes(r.email)) setSelEmails([...selEmails, r.email]); setQ(""); }}
                    className="mt-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-2">
                    <span className="truncate">{r.name} · {r.email}</span><Plus className="h-3.5 w-3.5" />
                  </button>
                ))}
                {selEmails.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selEmails.map((e) => <Chip key={e} on onClick={() => setSelEmails(selEmails.filter((x) => x !== e))}>{e} ✕</Chip>)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Programación */}
          <div className="rounded-xl border border-line bg-surface/40 p-3">
            <div className="mb-2 flex gap-1.5 text-xs">
              <button onClick={() => setWhen("now")} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${when === "now" ? "brand-gradient text-ink" : "border border-line text-muted hover:text-fg"}`}><Send className="h-3.5 w-3.5" /> Enviar ahora</button>
              <button onClick={() => setWhen("schedule")} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${when === "schedule" ? "brand-gradient text-ink" : "border border-line text-muted hover:text-fg"}`}><Clock className="h-3.5 w-3.5" /> Programar</button>
            </div>
            {when === "schedule" && (
              <div className="grid grid-cols-3 gap-2">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />
                <select value={tz} onChange={(e) => setTz(e.target.value)} className={field}>
                  {EVENT_TIMEZONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: vista previa + prueba */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Vista previa</span>
            <div className="flex gap-1">
              <button onClick={() => setPreview("desktop")} className={`rounded p-1.5 ${preview === "desktop" ? "bg-surface-2 text-fg" : "text-muted"}`}><Monitor className="h-4 w-4" /></button>
              <button onClick={() => setPreview("mobile")} className={`rounded p-1.5 ${preview === "mobile" ? "bg-surface-2 text-fg" : "text-muted"}`}><Smartphone className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="grid place-items-center rounded-2xl border border-line bg-black/30 p-4">
            <div className={`${preview === "mobile" ? "max-w-[320px]" : "w-full"} transition-all`}>
              <div className="rounded-2xl bg-[#08080c] p-5 text-[#f4f4f7]">
                <div className="text-[11px] text-muted">{fromName || "ShaarPass"} · {subject || "(asunto)"}</div>
                {preheader && <div className="mt-1 text-[11px] text-muted/70">{preheader}</div>}
                <div className="mt-3 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: previewHtml || "<span style='opacity:.5'>(cuerpo vacío)</span>" }} />
                <div className="mt-4 border-t border-line pt-2 text-[10px] text-muted">Enviado con ShaarPass · Darte de baja</div>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="tu@correo.com" className={field} />
            <button onClick={sendTest} disabled={pending} className="shrink-0 rounded-xl border border-line px-3 text-sm transition hover:border-white/20 disabled:opacity-50">Probar</button>
          </div>
        </div>
      </div>

      {err && <p className="mt-3 text-sm text-fuchsia">{err}</p>}
      {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}
      <button onClick={submit} disabled={pending}
        className="brand-gradient mt-4 flex items-center gap-2 rounded-2xl px-6 py-3 font-semibold text-ink disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : when === "now" ? <Send className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
        {when === "now" ? "Enviar ahora" : "Programar envío"}
      </button>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${on ? "bg-fuchsia/15 text-fuchsia" : "border border-line text-muted hover:text-fg"}`}>
      {on && <Check className="h-3 w-3" />}{children}
    </button>
  );
}

function CampaignMetrics({ c }: { c: CampaignRow }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ country: string; total: number; delivered: number; opened: number; clicked: number }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const delivered = c.delivered_count ?? 0, opened = c.opened_count ?? 0, clicked = c.clicked_count ?? 0;
  const bounced = c.bounced_count ?? 0, unsub = c.unsub_count ?? 0;
  const rate = (n: number) => (delivered > 0 ? Math.round((n / delivered) * 100) : 0);
  const noTracking = delivered === 0 && (c.sent_count ?? 0) > 0;

  async function loadCountries() {
    setOpen((o) => !o);
    if (rows || loading) return;
    setLoading(true);
    const res = await getCampaignCountryMetrics(c.id);
    setLoading(false);
    if (!("error" in res) && res.rows) setRows(res.rows);
  }

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Metric label="Entregados" value={String(delivered)} />
        <Metric label="Abiertos" value={`${rate(opened)}%`} sub={String(opened)} />
        <Metric label="Clics" value={`${rate(clicked)}%`} sub={String(clicked)} />
        <Metric label="Rebotes" value={String(bounced)} />
        <Metric label="Bajas" value={String(unsub)} />
      </div>
      {noTracking && <p className="mt-2 text-[11px] text-muted/70">Activa el webhook de Resend para ver aperturas y clics (entregados/rebotes en tiempo real).</p>}
      <button onClick={loadCountries} className="mt-2 flex items-center gap-1 text-[11px] text-muted transition hover:text-fg">
        <Globe className="h-3 w-3" /> Por país <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> :
            (rows ?? []).length === 0 ? <p className="text-[11px] text-muted">Sin datos.</p> :
            (rows ?? []).map((r) => (
              <div key={r.country} className="flex items-center justify-between text-[11px]">
                <span>{r.country}</span>
                <span className="text-muted">{r.total} env · {r.delivered ? Math.round((r.opened / r.delivered) * 100) : 0}% ab · {r.clicked} clics</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-surface/40 px-2 py-1.5 text-center">
      <div className="font-display text-base font-bold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted">{label}{sub ? ` · ${sub}` : ""}</div>
    </div>
  );
}

function CampaignStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "bg-emerald-500/10 text-emerald-300", scheduled: "bg-gold/10 text-gold",
    sending: "bg-fuchsia/10 text-fuchsia", draft: "bg-surface-2 text-muted", failed: "bg-rose-500/10 text-rose-400",
  };
  const label: Record<string, string> = { sent: "Enviada", scheduled: "Programada", sending: "Enviando", draft: "Borrador", failed: "Falló", canceled: "Cancelada" };
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${map[status] ?? "bg-surface-2 text-muted"}`}>{label[status] ?? status}</span>;
}
