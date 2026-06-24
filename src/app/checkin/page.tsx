"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanLine, Loader2 } from "lucide-react";

export default function CheckinLanding() {
  const router = useRouter();
  const [noToken, setNoToken] = useState(false);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("shaarpass:checkin-token") : null;
    if (token) router.replace(`/checkin/${token}`);
    else setNoToken(true);
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div className="glass max-w-sm rounded-3xl p-8">
        <div className="brand-gradient mx-auto grid h-14 w-14 place-items-center rounded-2xl text-ink">
          <ScanLine className="h-7 w-7" />
        </div>
        <h1 className="mt-5 font-display text-xl font-bold">ShaarPass Check-In</h1>
        {noToken ? (
          <p className="mt-3 text-sm text-muted">
            Abre el <span className="text-fg">enlace de escáner</span> que te envió el organizador del evento para comenzar a registrar accesos.
          </p>
        ) : (
          <div className="mt-6 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted" /></div>
        )}
      </div>
    </main>
  );
}
