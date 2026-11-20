import { describe, expect, it } from "vitest";
import {
  approxReplies,
  audioCost,
  creditStatus,
  creditsForUsd,
  packagePrice,
  WHATSAPP_MESSAGE_CREDITS,
} from "./credits";

describe("créditos", () => {
  it("1 crédito = US$0,01 de costo", () => {
    expect(creditsForUsd(0.0016)).toBe(0.16);
    expect(WHATSAPP_MESSAGE_CREDITS).toBe(2.6);
  });

  it("cobra los audios por minuto empezado", () => {
    expect(audioCost(90_000)).toEqual({ minutes: 1, usd: 0.0045 });
    expect(audioCost(200_000).minutes).toBe(2);
  });

  it("usa primero el plan y después los comprados", () => {
    const plan = { monthlyIncluded: 1000, perUserMonthly: null };
    expect(
      creditStatus(plan, { monthUsed: 300, extraBalance: 500 })
    ).toMatchObject({
      planLeft: 700,
      available: 1200,
      level: "ok",
    });
    expect(
      creditStatus(plan, { monthUsed: 1100, extraBalance: 150 })
    ).toMatchObject({ planLeft: 0, available: 150, level: "bajo" });
    expect(
      creditStatus(plan, { monthUsed: 1200, extraBalance: -2.6 })
    ).toMatchObject({ available: -2.6, level: "agotado" });
  });

  it("sin tope nunca se corta", () => {
    expect(
      creditStatus(
        { monthlyIncluded: null, perUserMonthly: null },
        { monthUsed: 99_999, extraBalance: 0 }
      )
    ).toMatchObject({ available: null, level: "ok" });
  });

  it("pasa el precio en dólares a pesos con IVA", () => {
    expect(packagePrice(38, 1570)).toEqual({
      netArs: 59_660,
      vatArs: 12_529,
      totalArs: 72_189,
    });
  });

  it("estima respuestas por WhatsApp", () => {
    expect(approxReplies(1000)).toBe(333);
  });
});
