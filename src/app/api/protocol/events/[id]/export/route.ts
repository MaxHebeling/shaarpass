import { NextResponse } from "next/server";
import { resolveProtocolAccess } from "@/lib/protocol/access";
import { loadProtocolData } from "@/lib/protocol/data";
import { buildReport, isReportKey, toCsv, type AuditRow } from "@/lib/protocol/reports";

export const runtime = "nodejs";

/** Exporta un reporte de Protocolo en CSV (Excel). Solo owner/admin de la org dueña. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = new URL(req.url).searchParams.get("report");
  if (!isReportKey(report)) return NextResponse.json({ error: "Reporte desconocido" }, { status: 400 });

  const a = await resolveProtocolAccess(id, report === "audit" ? "audit" : "export");
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });
  if (!a.settings?.enabled) return NextResponse.json({ error: "Módulo inactivo en este evento" }, { status: 409 });

  const data = await loadProtocolData(a.db, id);
  let audit: AuditRow[] = [];
  if (report === "audit") {
    const { data: rows } = await a.db.from("protocol_audit_log")
      .select("at, entity, action, actor_kind, before, after").eq("event_id", id).order("at", { ascending: false }).limit(5000);
    audit = (rows ?? []) as AuditRow[];
  }
  const csv = toCsv(buildReport(report, data, audit));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="protocolo-${report}-${a.event.slug}.csv"`,
      "cache-control": "no-store",
    },
  });
}
