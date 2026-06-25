"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteVenue } from "@/app/dashboard/recintos/actions";

export function DeleteVenueButton({ venueId, name }: { venueId: string; name: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (!confirm(`¿Eliminar el recinto "${name}" y todos sus mapas? No se puede deshacer.`)) return;
        start(async () => {
          const res = await deleteVenue(venueId);
          if (res?.error) alert(res.error);
          else router.refresh();
        });
      }}
      disabled={pending}
      aria-label="Eliminar recinto"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-muted transition hover:border-rose-500/50 hover:text-rose-400 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  );
}
