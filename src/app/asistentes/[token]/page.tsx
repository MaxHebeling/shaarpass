import type { Metadata } from "next";
import { AttendeesForm } from "@/components/protocol/AttendeesForm";

export const dynamic = "force-dynamic";

// Enlace privado del comprador: nunca indexar ni enviar como referer.
export const metadata: Metadata = {
  title: "Registro de asistentes",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AttendeesPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="aurora relative min-h-screen px-4 py-10 sm:py-14">
      <div className="relative z-10">
        <AttendeesForm token={token} />
      </div>
    </main>
  );
}
