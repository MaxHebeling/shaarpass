import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: h.captureException }));

import { captureError } from "./log";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("captureError", () => {
  it("devuelve un errorId y lo manda a Sentry como tag (correlación log ↔ Sentry)", () => {
    const id = captureError(new Error("boom"), { path: "/api/checkout" });

    expect(id).toMatch(/^e_/);
    expect(h.captureException).toHaveBeenCalledTimes(1);
    const [err, opts] = h.captureException.mock.calls[0];
    expect((err as Error).message).toBe("boom");
    expect(opts).toMatchObject({ tags: { errorId: id }, extra: { path: "/api/checkout" } });
  });

  it("nunca filtra secretos al contexto (ni al log ni a Sentry)", () => {
    captureError(new Error("x"), { stripeSecretKey: "sk_live_123", authorization: "Bearer abc", orderId: "o1" });
    const [, opts] = h.captureException.mock.calls[0];
    expect(opts.extra).toEqual({ stripeSecretKey: "[redacted]", authorization: "[redacted]", orderId: "o1" });
  });

  it("acepta valores que no son Error", () => {
    const id = captureError("algo raro pasó");
    expect(id).toMatch(/^e_/);
    expect((h.captureException.mock.calls[0][0] as Error).message).toBe("algo raro pasó");
  });

  it("si Sentry lanza, la petición no se cae", () => {
    h.captureException.mockImplementationOnce(() => {
      throw new Error("transporte roto");
    });
    expect(() => captureError(new Error("boom"))).not.toThrow();
  });
});
