import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveProtocolAccess } from "@/lib/protocol/access";
import { loadProtocolData } from "@/lib/protocol/data";
import { buildReport, isReportKey, type AuditRow } from "@/lib/protocol/reports";
import { CATEGORY_LABEL, isActive, tableOccupancy } from "@/lib/protocol/rules";
import { PrintButton } from "@/components/protocol/PrintButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Protocolo · impresión", robots: { index: false, follow: false } };

/**
 * Vista imprimible (Imprimir → Guardar como PDF) de reportes y tarjetas de mesa.
 * Mismos permisos que la exportación (owner/admin de la org dueña).
 */
export default async function PrintPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ report?: string; cards?: string }>;
}) {
  const { id } = await params;
  const { report, cards } = await searchParams;
  const a = await resolveProtocolAccess(id, report === "audit" ? "audit" : "export");
  if (!a.ok || !a.settings?.enabled) notFound();
  const data = await loadProtocolData(a.db, id);

  const sheet = "min-h-screen bg-white px-8 py-8 text-[13px] text-black print:p-0";

  if (cards) {
    const occ = tableOccupancy(data.tables, data.assignments, data.people);
    return (
      <main className={sheet}>
        <PrintButton />
        <div className="grid grid-cols-2 gap-4 print:gap-2">
          {occ.flatMap((o) => o.people.filter(isActive).map((p) => (
            <div key={p.id} className="flex h-40 flex-col items-center justify-center rounded-lg border-2 border-black/80 p-4 text-center [break-inside:avoid]">
              <div className="text-[11px] uppercase tracking-widest text-black/60">{a.event.title}</div>
              <div className="mt-2 text-2xl font-bold leading-tight">{p.full_name ?? "Invitado"}</div>
              {p.category && <div className="mt-1 text-sm text-black/70">{p.is_pastor ? "Pastor/a" : CATEGORY_LABEL[p.category]}</div>}
              <div className="mt-2 text-sm font-semibold">{o.table.name}</div>
            </div>
          )))}
        </div>
      </main>
    );
  }

  if (!isReportKey(report ?? null)) notFound();
  let audit: AuditRow[] = [];
  if (report === "audit") {
    const { data: rows } = await a.db.from("protocol_audit_log")
      .select("at, entity, action, actor_kind, before, after").eq("event_id", id).order("at", { ascending: false }).limit(2000);
    audit = (rows ?? []) as AuditRow[];
  }
  const t = buildReport(report as Parameters<typeof buildReport>[0], data, audit);
  return (
    <main className={sheet}>
      <PrintButton />
      <h1 className="text-xl font-bold">{t.title}</h1>
      <p className="mb-4 text-black/60">{a.event.title} · Generado el {new Date().toLocaleString("es-MX")} · {t.rows.length} registro(s)</p>
      <table className="w-full border-collapse">
        <thead><tr>{t.header.map((h) => <th key={h} className="border-b-2 border-black px-1.5 py-1 text-left text-[11px] uppercase">{h}</th>)}</tr></thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i} className="[break-inside:avoid] odd:bg-black/[0.03]">
              {r.map((c, j) => <td key={j} className="border-b border-black/15 px-1.5 py-1 align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
