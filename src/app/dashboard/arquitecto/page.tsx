import { EventArchitect } from "@/components/event-architect/EventArchitect";

export const metadata = { title: "Arquitecto IA de Eventos | ShaarPass" };

export default function ArquitectoPage() {
  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold">Arquitecto IA de Eventos</h1>
        <p className="text-sm text-muted">Generador Inteligente de Espacios — diseña el evento completo y deja el mapa listo para tickets, asientos y check-in.</p>
      </div>
      <EventArchitect />
    </div>
  );
}
