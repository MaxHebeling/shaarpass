import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { RegisterSW } from "@/components/checkin/RegisterSW";

// Manifest e identidad propios → instalable como "ShaarPass Check-In".
export const metadata: Metadata = {
  title: "ShaarPass Check-In",
  manifest: "/checkin.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Check-In",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: [{ url: "/web-app-manifest-192x192.png", sizes: "192x192" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#08080c",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function CheckinLayout({ children }: { children: ReactNode }) {
  return <><RegisterSW />{children}</>;
}
