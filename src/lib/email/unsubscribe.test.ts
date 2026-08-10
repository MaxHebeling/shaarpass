/**
 * Lo que se protege aquí:
 *  1. Que rotar el secreto NO invalide los enlaces ya enviados por correo
 *     (los 451 que salieron no se pueden reescribir).
 *  2. Que una firma inventada no dé de baja a nadie.
 */
import { describe, it, expect } from "vitest";
import { unsubSig, verifyUnsubSig, unsubSecrets } from "./unsubscribe";

const VIEJO = "clave-de-supabase-antigua";
const NUEVO = "secreto-dedicado-de-bajas";

describe("selección de secretos", () => {
  it("sin nada configurado no revienta", () => {
    expect(unsubSecrets({})).toEqual(["shaarpass"]);
  });

  it("mantiene el comportamiento histórico: sin variables nuevas, firma con la de Supabase", () => {
    const env = { SUPABASE_SERVICE_ROLE_KEY: VIEJO };
    expect(unsubSig("ana@test.mx", env)).toBe(unsubSig("ana@test.mx", { UNSUBSCRIBE_SECRET: VIEJO }));
  });

  it("UNSUBSCRIBE_SECRET tiene prioridad sobre la clave de Supabase", () => {
    const env = { UNSUBSCRIBE_SECRET: NUEVO, SUPABASE_SERVICE_ROLE_KEY: VIEJO };
    expect(unsubSecrets(env)[0]).toBe(NUEVO);
  });

  it("no duplica si dos variables traen el mismo valor", () => {
    expect(unsubSecrets({ UNSUBSCRIBE_SECRET: NUEVO, QUEUE_SECRET: NUEVO })).toEqual([NUEVO]);
  });

  it("ignora valores vacíos o en blanco", () => {
    expect(unsubSecrets({ UNSUBSCRIBE_SECRET: "   ", SUPABASE_SERVICE_ROLE_KEY: VIEJO })).toEqual([VIEJO]);
  });
});

describe("rotación sin romper los correos ya enviados", () => {
  const email = "ana@test.mx";

  it("un enlace firmado ANTES de rotar sigue siendo válido DESPUÉS", () => {
    // Enlace impreso en un correo cuando la firma dependía de Supabase.
    const firmaVieja = unsubSig(email, { SUPABASE_SERVICE_ROLE_KEY: VIEJO });

    // Tras rotar: secreto dedicado nuevo + el anterior guardado como legacy.
    const despues = { UNSUBSCRIBE_SECRET: NUEVO, UNSUBSCRIBE_SECRET_LEGACY: VIEJO };

    expect(verifyUnsubSig(email, firmaVieja, despues)).toBe(true);
  });

  it("los enlaces nuevos se firman con el secreto nuevo y también valen", () => {
    const despues = { UNSUBSCRIBE_SECRET: NUEVO, UNSUBSCRIBE_SECRET_LEGACY: VIEJO };
    expect(verifyUnsubSig(email, unsubSig(email, despues), despues)).toBe(true);
  });

  it("al retirar el legacy, los enlaces viejos dejan de valer (fin de la transición)", () => {
    const firmaVieja = unsubSig(email, { SUPABASE_SERVICE_ROLE_KEY: VIEJO });
    expect(verifyUnsubSig(email, firmaVieja, { UNSUBSCRIBE_SECRET: NUEVO })).toBe(false);
  });
});

describe("no se puede falsificar una baja", () => {
  const env = { UNSUBSCRIBE_SECRET: NUEVO };

  it("firma inventada → false", () => {
    expect(verifyUnsubSig("ana@test.mx", "0".repeat(24), env)).toBe(false);
  });

  it("firma de OTRO correo no sirve para el mío", () => {
    const deBeto = unsubSig("beto@test.mx", env);
    expect(verifyUnsubSig("ana@test.mx", deBeto, env)).toBe(false);
  });

  it("firma vacía, nula o de otra longitud → false, sin lanzar", () => {
    for (const s of ["", undefined, null, "abc", "z".repeat(64)]) {
      expect(verifyUnsubSig("ana@test.mx", s as string, env)).toBe(false);
    }
  });

  it("sin correo → false", () => {
    expect(verifyUnsubSig("", unsubSig("ana@test.mx", env), env)).toBe(false);
  });
});

describe("forma de la firma", () => {
  const env = { UNSUBSCRIBE_SECRET: NUEVO };

  it("24 caracteres hex y determinista", () => {
    const a = unsubSig("ana@test.mx", env);
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(unsubSig("ana@test.mx", env)).toBe(a);
  });

  it("no distingue mayúsculas en el correo (el usuario reescribe el suyo)", () => {
    expect(unsubSig("Ana@Test.MX", env)).toBe(unsubSig("ana@test.mx", env));
    expect(verifyUnsubSig("ANA@TEST.MX", unsubSig("ana@test.mx", env), env)).toBe(true);
  });
});
