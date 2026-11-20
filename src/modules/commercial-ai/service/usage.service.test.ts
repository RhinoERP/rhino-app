import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin-client", () => ({ createAdminClient: vi.fn() }));

const { costUsd, monthStartIso } = await import("./usage.service");

describe("costUsd", () => {
  it("calcula el costo de Haiku 5.5 por millón de tokens", () => {
    const cost = costUsd("claude-haiku-5-5", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(cost).toBeCloseTo(0.6);
  });

  it("cobra la caché más barata que la entrada normal", () => {
    const base = { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0 };
    const cached = costUsd("claude-haiku-5-5", {
      ...base,
      cacheReadTokens: 1_000_000,
    });
    expect(cached).toBeCloseTo(0.01);
  });

  it("usa el precio más alto para un modelo desconocido", () => {
    const usage = {
      inputTokens: 1000,
      outputTokens: 1000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    expect(costUsd("modelo-nuevo", usage)).toBeGreaterThan(
      costUsd("claude-opus-5-5", usage)
    );
  });
});

describe("monthStartIso", () => {
  it("arranca el mes a la medianoche de Buenos Aires", () => {
    expect(monthStartIso(new Date("2026-10-27T15:00:00Z"))).toBe(
      "2026-10-01T03:00:00.000Z"
    );
    expect(monthStartIso(new Date("2026-11-01T04:00:00Z"))).toBe(
      "2026-11-01T03:00:00.000Z"
    );
  });
});
