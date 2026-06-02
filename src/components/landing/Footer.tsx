import { Ticket } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-line px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-2 font-display text-lg font-bold">
          <span className="brand-gradient grid h-8 w-8 place-items-center rounded-xl text-ink">
            <Ticket className="h-4 w-4" strokeWidth={2.5} />
          </span>
          ShaarPass
        </div>
        <p className="text-sm text-muted">Te quedas con más de cada boleto.</p>
        <div className="flex gap-6 text-sm text-muted">
          <a href="/descubrir" className="transition hover:text-fg">Descubrir</a>
          <a href="/login" className="transition hover:text-fg">Entrar</a>
          <a href="mailto:hola@shaarpass.io" className="transition hover:text-fg">Contacto</a>
        </div>
      </div>
      <p className="mt-8 text-center text-xs text-muted/60">
        © 2026 ShaarPass. Hecho para organizadores que merecen más.
      </p>
    </footer>
  );
}
