/**
 * Logging estructurado y punto único de captura de errores.
 *
 * Hoy escribe JSON a stdout (visible en los logs de Vercel, correlacionable).
 * Si en el futuro se configura Sentry (SENTRY_DSN), este es el único lugar que
 * hay que ampliar — el resto del código ya llama a captureError().
 */
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields: Fields = {}) {
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...safe(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Nunca serializa objetos gigantes ni secretos evidentes. */
function safe(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (/secret|token|key|password|authorization/i.test(k)) { out[k] = "[redacted]"; continue; }
    out[k] = v instanceof Error ? { name: v.name, message: v.message } : v;
  }
  return out;
}

export const log = {
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};

/**
 * Captura un error para observabilidad. Devuelve un id corto para mostrar al
 * usuario y correlacionar en los logs. Cuando exista Sentry, enviar aquí.
 */
export function captureError(err: unknown, context: Fields = {}): string {
  const id = errorId();
  const e = err instanceof Error ? err : new Error(String(err));
  log.error(e.message, { errorId: id, name: e.name, stack: e.stack?.split("\n").slice(0, 4).join(" | "), ...context });
  // TODO(observabilidad): si process.env.SENTRY_DSN, Sentry.captureException(e, { extra: { errorId, ...context } })
  return id;
}

/** id determinístico-suficiente sin depender de Math.random (bloqueado en algunos entornos). */
function errorId(): string {
  return "e_" + Date.now().toString(36) + "_" + (globalThis.crypto?.randomUUID?.().slice(0, 8) ?? "x");
}
