"use client";

import { useEffect } from "react";

/** Registra el service worker del check-in (scope /checkin) para soporte offline. */
export function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-checkin.js", { scope: "/checkin" }).catch(() => {});
    }
  }, []);
  return null;
}
