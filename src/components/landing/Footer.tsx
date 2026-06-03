
export function Footer() {
  return (
    <footer className="border-t border-line px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex items-center gap-2.5 font-display text-lg font-bold">
          <img src="/logo-mark.png" alt="ShaarPass" className="h-9 w-9 rounded-xl" />
          ShaarPass
        </div>
        <p className="text-sm text-muted">Te quedas con más de cada boleto.</p>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted">
          <a href="/descubrir" className="transition hover:text-fg">Descubrir</a>
          <a href="/precios" className="transition hover:text-fg">Precios</a>
          <a href="/como-funciona" className="transition hover:text-fg">Cómo funciona</a>
          <a href="/nosotros" className="transition hover:text-fg">Nosotros</a>
          <a href="/blog" className="transition hover:text-fg">Blog</a>
          <a href="/login" className="transition hover:text-fg">Entrar</a>
          <a href="/terminos" className="transition hover:text-fg">Términos</a>
          <a href="/privacidad" className="transition hover:text-fg">Privacidad</a>
          <a href="mailto:tickets@shaarpass.io" className="transition hover:text-fg">Contacto</a>
        </div>
      </div>
      <p className="mt-8 text-center text-xs text-muted/60">
        © 2026 ShaarPass. Hecho para organizadores que merecen más.
      </p>
    </footer>
  );
}
