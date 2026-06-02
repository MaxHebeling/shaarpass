/** Formatea centavos a su moneda (cualquier ISO 4217 de 2 decimales). */
export function money(cents: number, currency: string): string {
  try {
    return (cents / 100).toLocaleString("es-MX", {
      style: "currency",
      currency: currency.toUpperCase(),
    });
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
