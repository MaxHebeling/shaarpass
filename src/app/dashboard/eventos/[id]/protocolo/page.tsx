import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { resolveProtocolAccess, can } from "@/lib/protocol/access";
import { loadProtocolData } from "@/lib/protocol/data";
import { ProtocolDashboard } from "@/components/protocol/ProtocolDashboard";
import { SettingsPanel } from "@/components/protocol/SettingsPanel";

export const dynamic = "force-dynamic";

/** Gestión de Asistentes y Protocolo — exclusivo de organizaciones con el feature `protocol`. */
export default async function ProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await resolveProtocolAccess(id, "view");
  // Para cualquier otra organización (o sin permiso) la ruta simplemente no existe.
  if (!a.ok) notFound();

  const header = (
    <>
      <Link href={`/dashboard/eventos/${id}`} className="mb-4 flex items-center gap-2 text-sm text-muted transition hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> {a.event.title}
      </Link>
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-gold"><Users className="h-4 w-4" /> Protocolo</div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Gestión de Asistentes y Protocolo</h1>
      </div>
    </>
  );

  if (!a.settings?.enabled) {
    return (
      <div className="mx-auto max-w-3xl">
        {header}
        {can(a.role, "settings") ? (
          <>
            <p className="mb-4 text-sm text-muted">Este módulo aún no está activo para este evento. Elige qué funciones necesitas y actívalo.</p>
            <SettingsPanel eventId={id} settings={a.settings} />
          </>
        ) : (
          <p className="glass rounded-3xl p-6 text-sm text-muted">El módulo no está activo en este evento. Pide a un administrador que lo active.</p>
        )}
      </div>
    );
  }

  const data = await loadProtocolData(a.db, id);
  // El rol staff no necesita correo/teléfono de compradores fuera de lo que ya ve en Órdenes; se mantiene.
  return (
    <div className="mx-auto max-w-6xl">
      {header}
      <ProtocolDashboard eventId={id} role={a.role} settings={a.settings} data={data} />
    </div>
  );
}
