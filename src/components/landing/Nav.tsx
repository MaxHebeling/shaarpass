"use client";

import { useEffect, useState } from "react";

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "py-3" : "py-5"
      }`}
    >
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between rounded-full px-5 transition-all duration-300 ${
          scrolled ? "glass py-2.5 shadow-2xl shadow-black/40" : "py-2"
        }`}
      >
        <a href="/" className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight">
          <img src="/logo-mark.png" alt="ShaarPass" className="h-9 w-9 rounded-xl shadow-lg shadow-fuchsia/20" />
          ShaarPass
        </a>

        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="/descubrir" className="transition hover:text-fg">Descubrir</a>
          <a href="/precios" className="transition hover:text-fg">Precios</a>
          <a href="/como-funciona" className="transition hover:text-fg">Cómo funciona</a>
          <a href="/nosotros" className="transition hover:text-fg">Nosotros</a>
        </nav>

        <div className="flex items-center gap-3">
          <a href="/login" className="hidden text-sm text-muted transition hover:text-fg sm:block">
            Entrar
          </a>
          <a
            href="/login"
            className="brand-gradient rounded-full px-4 py-2 text-sm font-semibold text-ink shadow-lg shadow-fuchsia/20 transition hover:scale-[1.03]"
          >
            Crear evento
          </a>
        </div>
      </div>
    </header>
  );
}
