import localFont from "next/font/local";

// Fuentes SELF-HOSTED (variables, subset latin) para que el build NO dependa de
// descargar Google Fonts en CI (evita el fallo intermitente de next/font/google).
// Mismas CSS vars que antes → cambio transparente para layout.tsx y globals.css.

export const display = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  weight: "300 700", // Space Grotesk variable (usamos 500/600/700)
  variable: "--font-display",
  display: "swap",
});

export const sans = localFont({
  src: "./fonts/inter-latin.woff2",
  weight: "100 900", // Inter variable
  variable: "--font-sans",
  display: "swap",
});
