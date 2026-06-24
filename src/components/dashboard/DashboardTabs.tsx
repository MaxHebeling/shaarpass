"use client";

import { useState, type ReactNode } from "react";

export interface TabDef { id: string; label: string; icon?: ReactNode; content: ReactNode; }

/**
 * Pestañas del panel de gestión. Renderiza TODO el contenido pero oculta las
 * pestañas inactivas con `hidden` (no desmonta) para preservar el estado de los
 * editores con input sin guardar. Barra sticky y scrollable en móvil.
 */
export function DashboardTabs({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div>
      <div className="sticky top-0 z-20 -mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line bg-ink/85 px-1 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
              active === t.id ? "border-fuchsia text-fg" : "border-transparent text-muted hover:text-fg"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={active === t.id ? "space-y-6" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
