import { CheckCircle2, XCircle } from "lucide-react";
import { createPublicClient } from "@/lib/supabase/public";
import { unsubSig } from "@/lib/email/campaigns";

export const dynamic = "force-dynamic";
export const metadata = { title: "Darte de baja — ShaarPass", robots: { index: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ e?: string; s?: string }> }) {
  const { e, s } = await searchParams;
  let ok = false;
  if (e && s && s === unsubSig(e)) {
    try {
      await createPublicClient().rpc("email_optout", { p_email: e });
      ok = true;
    } catch { /* noop */ }
  }

  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div className="glass max-w-md rounded-3xl p-8">
        {ok ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
            <h1 className="mt-4 font-display text-2xl font-bold">Listo, te diste de baja</h1>
            <p className="mt-2 text-sm text-muted">
              Ya no recibirás correos de marketing{e ? ` en ${e}` : ""}. Seguirás recibiendo los correos de tus
              boletos (transaccionales).
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-12 w-12 text-fuchsia" />
            <h1 className="mt-4 font-display text-2xl font-bold">Enlace no válido</h1>
            <p className="mt-2 text-sm text-muted">
              No pudimos procesar la baja. Escríbenos a{" "}
              <a href="mailto:hola@shaarpass.io" className="brand-text">hola@shaarpass.io</a> y lo hacemos por ti.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
