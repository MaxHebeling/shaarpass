import type { Metadata } from "next";
import type { ReactNode } from "react";
import { display, sans } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShaarPass — Vende boletos con la comisión más baja y transparente",
  description:
    "La plataforma de eventos donde te quedas con más de cada boleto. Fees bajos y claros, pagos al instante, sin letra chica. La alternativa premium a Eventbrite.",
  openGraph: {
    title: "ShaarPass — Te quedas con más de cada boleto",
    description: "Fees bajos y transparentes. Pagos al instante. La alternativa premium a Eventbrite.",
    type: "website",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  themeColor: "#08080c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable}`}>
      <body className="grain">{children}</body>
    </html>
  );
}
