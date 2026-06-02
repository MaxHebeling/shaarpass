import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { display, sans } from "@/lib/fonts";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.shaarpass.io";
const GOOGLE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "ShaarPass — Vende boletos con la comisión más baja y transparente",
  description:
    "La plataforma de eventos donde te quedas con más de cada boleto. Fees bajos y claros, pagos al instante, sin letra chica. La alternativa premium a Eventbrite.",
  openGraph: {
    title: "ShaarPass — Te quedas con más de cada boleto",
    description: "Fees bajos y transparentes. Pagos al instante. La alternativa premium a Eventbrite.",
    type: "website",
    url: SITE_URL,
    siteName: "ShaarPass",
    locale: "es_MX",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "ShaarPass — Boletos con la comisión más baja y transparente" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ShaarPass — Te quedas con más de cada boleto",
    description: "Fees bajos y transparentes. Pagos al instante. La alternativa premium a Eventbrite.",
    images: ["/og.jpg"],
  },
  manifest: "/manifest.webmanifest",
  ...(GOOGLE_VERIFICATION ? { verification: { google: GOOGLE_VERIFICATION } } : {}),
};

export const viewport = {
  themeColor: "#08080c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${sans.variable}`}>
      <body className="grain">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
