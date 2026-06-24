/** Automatizaciones de email basadas en tiempo (relativas a la fecha del evento). */

const DAY = 86_400_000, HOUR = 3_600_000;

export interface AutomationDef {
  key: string;
  label: string;
  description: string;
  base: "start" | "end";   // relativo a starts_at o ends_at
  offsetMs: number;        // negativo = antes; positivo = después
  subject: string;
  body: string;
}

export const AUTOMATIONS: AutomationDef[] = [
  {
    key: "reminder_30d", label: "Recordatorio 30 días", description: "30 días antes del evento", base: "start", offsetMs: -30 * DAY,
    subject: "Falta 1 mes para {{eventName}} 🎉",
    body: "Hola {{firstName}},\n\nFalta un mes para {{eventName}} ({{eventDate}}). ¡Ve agendándolo!\n\nNos vemos pronto.",
  },
  {
    key: "reminder_15d", label: "Recordatorio 15 días", description: "15 días antes", base: "start", offsetMs: -15 * DAY,
    subject: "Faltan 15 días para {{eventName}}",
    body: "Hola {{firstName}},\n\nYa casi es {{eventName}} ({{eventDate}}). Prepara todo para no perderte nada.\n\n¡Te esperamos!",
  },
  {
    key: "reminder_7d", label: "Recordatorio 7 días", description: "1 semana antes", base: "start", offsetMs: -7 * DAY,
    subject: "Falta 1 semana para {{eventName}} 🙌",
    body: "Hola {{firstName}},\n\nFalta una semana para {{eventName}}. Revisa tu boleto y los detalles de acceso. ¡Nos vemos el {{eventDate}}!",
  },
  {
    key: "reminder_24h", label: "Recordatorio 24 horas", description: "1 día antes", base: "start", offsetMs: -1 * DAY,
    subject: "¡Mañana es {{eventName}}! 🎟️",
    body: "Hola {{firstName}},\n\n¡Mañana nos vemos en {{eventName}}! Lleva tu boleto con código QR listo en tu teléfono para entrar rápido.\n\nNos vemos pronto.",
  },
  {
    key: "reminder_1h", label: "Recordatorio 1 hora", description: "1 hora antes", base: "start", offsetMs: -1 * HOUR,
    subject: "Empieza en 1 hora: {{eventName}}",
    body: "Hola {{firstName}},\n\n{{eventName}} empieza en 1 hora. Ten tu boleto con QR a la mano para el acceso. ¡Te esperamos!",
  },
  {
    key: "thank_you", label: "Gracias por asistir", description: "Al terminar el evento", base: "end", offsetMs: 1 * HOUR,
    subject: "¡Gracias por asistir a {{eventName}}! 💛",
    body: "Hola {{firstName}},\n\nGracias por ser parte de {{eventName}}. Esperamos que lo hayas disfrutado tanto como nosotros.\n\nNos vemos en el próximo.",
  },
  {
    key: "survey_24h", label: "Encuesta de satisfacción", description: "24 horas después", base: "end", offsetMs: 1 * DAY,
    subject: "¿Cómo estuvo {{eventName}}? Cuéntanos",
    body: "Hola {{firstName}},\n\nNos encantaría saber tu opinión sobre {{eventName}}. ¿Nos regalas 1 minuto para responder?\n\nResponde este correo con tus comentarios. ¡Gracias!",
  },
];

export function automationDef(key: string): AutomationDef | undefined {
  return AUTOMATIONS.find((a) => a.key === key);
}

/** Calcula el instante de envío (ISO) de una automatización para un evento. */
export function automationScheduledAt(def: AutomationDef, startsAt: string, endsAt: string): string {
  const base = def.base === "end" ? new Date(endsAt) : new Date(startsAt);
  return new Date(base.getTime() + def.offsetMs).toISOString();
}
