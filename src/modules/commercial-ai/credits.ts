/**
 * Créditos de IA Comercial · reglas puras (sin base ni red).
 *
 * 1 crédito = US$0,01 de costo nuestro. Todo lo que cuesta plata descuenta:
 * - IA (Claude): el costo real de cada llamada (tokens × precio del modelo).
 * - WhatsApp: cada mensaje que mandamos (tarifa de Meta para Argentina).
 * - Audio: cada minuto transcripto (OpenAI).
 * Así el cliente ve una sola unidad y nosotros nunca vendemos por debajo del
 * costo: los precios de los paquetes ya tienen el margen.
 */

export const USD_PER_CREDIT = 0.01;

/**
 * Meta, Argentina, desde el 1/10/2026: US$0,026 por mensaje de servicio o
 * plantilla de utilidad entregado. Hay 1.000 gratis por mes por número, pero
 * se comparten con el agente de clientes: se cobra siempre (conservador).
 */
export const WHATSAPP_MESSAGE_USD = 0.026;

/** OpenAI gpt-transcribe: US$0,0045 por minuto. */
export const AUDIO_MINUTE_USD = 0.0045;

/** Una nota de voz de WhatsApp (Opus) ocupa unos 3 KB por segundo. */
const AUDIO_BYTES_PER_SECOND = 3000;
const SECONDS_PER_MINUTE = 60;
const CENTS = 100;
/** Si no se fijó otra cosa, cada empresa trae estos créditos por mes. */
export const DEFAULT_MONTHLY_CREDITS = 1000;
/** Avisamos cuando queda menos de este porcentaje del plan y no hay comprados. */
export const LOW_CREDITS_RATIO = 0.2;
export const VAT_RATE = 0.21;

export function roundCredits(value: number): number {
  return Math.round(value * CENTS) / CENTS;
}

export function creditsForUsd(usd: number): number {
  return roundCredits(usd / USD_PER_CREDIT);
}

export const WHATSAPP_MESSAGE_CREDITS = creditsForUsd(WHATSAPP_MESSAGE_USD);

/** Minutos de audio (estimados por el tamaño) y su costo. */
export function audioCost(bytes: number): { minutes: number; usd: number } {
  const seconds = Math.max(1, bytes / AUDIO_BYTES_PER_SECOND);
  const minutes = Math.ceil(seconds / SECONDS_PER_MINUTE);
  return { minutes, usd: minutes * AUDIO_MINUTE_USD };
}

export type CreditPlan = {
  /** null = sin tope (contrato especial): se mide pero no se corta. */
  monthlyIncluded: number | null;
  perUserMonthly: number | null;
};

export type WalletState = {
  monthUsed: number;
  extraBalance: number;
};

export type CreditStatus = {
  included: number | null;
  monthUsed: number;
  planLeft: number | null;
  extraBalance: number;
  /** Lo que queda para usar: plan del mes + comprados. null = sin tope. */
  available: number | null;
  level: "ok" | "bajo" | "agotado";
};

export function creditStatus(
  plan: CreditPlan,
  wallet: WalletState
): CreditStatus {
  if (plan.monthlyIncluded === null) {
    return {
      included: null,
      monthUsed: wallet.monthUsed,
      planLeft: null,
      extraBalance: wallet.extraBalance,
      available: null,
      level: "ok",
    };
  }
  const planLeft = Math.max(plan.monthlyIncluded - wallet.monthUsed, 0);
  const available = roundCredits(planLeft + wallet.extraBalance);
  let level: CreditStatus["level"] = "ok";
  if (available <= 0) {
    level = "agotado";
  } else if (
    available < plan.monthlyIncluded * LOW_CREDITS_RATIO ||
    (plan.monthlyIncluded === 0 && wallet.extraBalance < 100)
  ) {
    level = "bajo";
  }
  return {
    included: plan.monthlyIncluded,
    monthUsed: wallet.monthUsed,
    planLeft,
    extraBalance: wallet.extraBalance,
    available,
    level,
  };
}

export type PackagePrice = {
  netArs: number;
  vatArs: number;
  totalArs: number;
};

/** Precio en pesos al dólar del día, más IVA. Redondeado a pesos enteros. */
export function packagePrice(
  priceUsd: number,
  arsPerUsd: number
): PackagePrice {
  const netArs = Math.round(priceUsd * arsPerUsd);
  const vatArs = Math.round(netArs * VAT_RATE);
  return { netArs, vatArs, totalArs: netArs + vatArs };
}

/** Cuántas respuestas por WhatsApp alcanzan, aproximado (3 créditos cada una). */
export const CREDITS_PER_TYPICAL_REPLY = 3;

export function approxReplies(credits: number): number {
  return Math.floor(credits / CREDITS_PER_TYPICAL_REPLY);
}
