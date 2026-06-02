/** Formatea centavos a moneda local. */
export function money(cents: number, currency: string): string {
  return (cents / 100).toLocaleString("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  });
}
