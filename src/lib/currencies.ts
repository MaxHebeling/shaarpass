/**
 * Monedas soportadas (globales). Solo monedas de 2 decimales — compatibles con
 * el modelo de almacenamiento en "centavos" (price_cents). Se excluyen las de
 * cero decimales (JPY, KRW, CLP, PYG, VND, etc.) porque romperían la matemática
 * de /100; añadirlas requeriría manejar la unidad mínima por moneda.
 */
export interface CurrencyOption { code: string; label: string }

export const CURRENCIES: CurrencyOption[] = [
  // Américas (mercado principal primero)
  { code: "mxn", label: "MXN — Peso mexicano" },
  { code: "usd", label: "USD — Dólar estadounidense" },
  { code: "cad", label: "CAD — Dólar canadiense" },
  { code: "brl", label: "BRL — Real brasileño" },
  { code: "ars", label: "ARS — Peso argentino" },
  { code: "cop", label: "COP — Peso colombiano" },
  { code: "pen", label: "PEN — Sol peruano" },
  { code: "uyu", label: "UYU — Peso uruguayo" },
  { code: "bob", label: "BOB — Boliviano" },
  { code: "dop", label: "DOP — Peso dominicano" },
  { code: "gtq", label: "GTQ — Quetzal guatemalteco" },
  { code: "hnl", label: "HNL — Lempira hondureña" },
  { code: "nio", label: "NIO — Córdoba nicaragüense" },
  { code: "crc", label: "CRC — Colón costarricense" },
  // Europa
  { code: "eur", label: "EUR — Euro" },
  { code: "gbp", label: "GBP — Libra esterlina" },
  { code: "chf", label: "CHF — Franco suizo" },
  { code: "pln", label: "PLN — Złoty polaco" },
  { code: "sek", label: "SEK — Corona sueca" },
  { code: "nok", label: "NOK — Corona noruega" },
  { code: "dkk", label: "DKK — Corona danesa" },
  { code: "czk", label: "CZK — Corona checa" },
  { code: "ron", label: "RON — Leu rumano" },
  { code: "try", label: "TRY — Lira turca" },
  // Asia-Pacífico
  { code: "aud", label: "AUD — Dólar australiano" },
  { code: "nzd", label: "NZD — Dólar neozelandés" },
  { code: "sgd", label: "SGD — Dólar de Singapur" },
  { code: "hkd", label: "HKD — Dólar de Hong Kong" },
  { code: "inr", label: "INR — Rupia india" },
  { code: "php", label: "PHP — Peso filipino" },
  { code: "myr", label: "MYR — Ringgit malayo" },
  { code: "thb", label: "THB — Baht tailandés" },
  { code: "cny", label: "CNY — Yuan chino" },
  // Medio Oriente y África
  { code: "aed", label: "AED — Dírham (EAU)" },
  { code: "sar", label: "SAR — Riyal saudí" },
  { code: "ils", label: "ILS — Séquel israelí" },
  { code: "zar", label: "ZAR — Rand sudafricano" },
  { code: "ngn", label: "NGN — Naira nigeriana" },
  { code: "kes", label: "KES — Chelín keniano" },
  { code: "egp", label: "EGP — Libra egipcia" },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);
export function isSupportedCurrency(code: string): boolean {
  return CURRENCY_CODES.includes(code.toLowerCase());
}
