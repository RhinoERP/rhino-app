import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { packagePrice } from "../credits";

/**
 * Compra de créditos con Mercado Pago (Checkout Pro).
 *
 * 1. El gerente elige un paquete: se crea la compra "pendiente" con el precio
 *    en pesos (dólar oficial del día + IVA) y una preferencia de pago.
 * 2. Paga en Mercado Pago. Mercado Pago avisa al webhook y además vuelve a
 *    /ia-comercial/creditos con el id del pago.
 * 3. En los dos casos se consulta el pago a la API de Mercado Pago con nuestro
 *    token (no se confía en lo que llega) y, si está aprobado y el monto
 *    coincide, se acreditan los créditos una sola vez.
 */

const MP_API = "https://api.mercadopago.com";
const DOLAR_API = "https://dolarapi.com/v1/dolares/oficial";
const AMOUNT_TOLERANCE_ARS = 1;
const PAYMENT_ID = /^\d{1,20}$/;
const TRAILING_SLASH = /\/$/;
const SIGNATURE_PART = /^\s*(ts|v1)=(.+)\s*$/;

export class CreditPurchaseError extends Error {}

function accessToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) {
    throw new CreditPurchaseError(
      "Mercado Pago no está configurado todavía (falta MERCADOPAGO_ACCESS_TOKEN)."
    );
  }
  return token;
}

/** Dirección pública de esta versión de Rhinos (preview o producción). */
export function appBaseUrl(): string {
  const preview =
    process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL;
  const base = preview
    ? `https://${process.env.VERCEL_BRANCH_URL}`
    : process.env.NEXT_PUBLIC_APP_URL;
  if (!base) {
    throw new CreditPurchaseError("Falta NEXT_PUBLIC_APP_URL.");
  }
  return base.replace(TRAILING_SLASH, "");
}

/** Dólar oficial (venta, Banco Nación). Si la consulta falla, el de respaldo. */
export async function arsPerUsd(): Promise<number> {
  try {
    const response = await fetch(DOLAR_API, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (response.ok) {
      const json = (await response.json()) as { venta?: unknown };
      const rate = Number(json.venta);
      if (Number.isFinite(rate) && rate > 0) {
        return rate;
      }
    }
  } catch {
    // Se usa el de respaldo.
  }
  const fallback = Number(process.env.COMMERCIAL_AI_ARS_PER_USD);
  if (Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }
  throw new CreditPurchaseError(
    "No pude obtener la cotización del dólar. Probá en un rato."
  );
}

export async function startCreditPurchase(params: {
  organizationId: string;
  orgSlug: string;
  packageKey: string;
  userId: string;
  payerEmail?: string | null;
}): Promise<string> {
  const admin = createAdminClient();
  const token = accessToken();
  const { data: pack } = await admin
    .from("commercial_ai_credit_packages")
    .select("key, name, credits, price_usd, active")
    .eq("key", params.packageKey)
    .maybeSingle();
  if (!pack?.active) {
    throw new CreditPurchaseError("Ese paquete no está disponible.");
  }
  const rate = await arsPerUsd();
  const price = packagePrice(Number(pack.price_usd), rate);
  const { data: purchase, error } = await admin
    .from("commercial_ai_credit_purchases")
    .insert({
      organization_id: params.organizationId,
      package_key: pack.key,
      credits: pack.credits,
      price_usd: pack.price_usd,
      ars_per_usd: rate,
      net_ars: price.netArs,
      vat_ars: price.vatArs,
      total_ars: price.totalArs,
      created_by: params.userId,
    })
    .select("id")
    .single();
  if (error || !purchase) {
    throw new Error(error?.message ?? "No se pudo iniciar la compra");
  }

  const base = appBaseUrl();
  const back = `${base}/org/${params.orgSlug}/ia-comercial/creditos`;
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const notification = `${base}/api/webhooks/mercadopago${bypass ? `?x-vercel-protection-bypass=${encodeURIComponent(bypass)}` : ""}`;
  const response = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": purchase.id as string,
    },
    body: JSON.stringify({
      items: [
        {
          id: pack.key,
          title: `Rhinos IA Comercial · ${pack.credits} créditos (${pack.name})`,
          quantity: 1,
          currency_id: "ARS",
          unit_price: price.totalArs,
        },
      ],
      external_reference: purchase.id,
      ...(params.payerEmail ? { payer: { email: params.payerEmail } } : {}),
      back_urls: { success: back, pending: back, failure: back },
      auto_return: "approved",
      notification_url: notification,
      statement_descriptor: "RHINOS",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    console.error(
      "Mercado Pago: no se pudo crear la preferencia",
      response.status,
      await response.text()
    );
    throw new CreditPurchaseError(
      "Mercado Pago no respondió. Probá de nuevo en un rato."
    );
  }
  const preference = (await response.json()) as {
    id?: string;
    init_point?: string;
  };
  if (!preference.init_point) {
    throw new CreditPurchaseError("Mercado Pago no devolvió el link de pago.");
  }
  await admin
    .from("commercial_ai_credit_purchases")
    .update({ mp_preference_id: preference.id ?? null })
    .eq("id", purchase.id);
  return preference.init_point;
}

type MpPayment = {
  id: number;
  status: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
};

const FINAL_REJECTED = new Set([
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
]);

export type PurchaseOutcome =
  | { state: "acreditada"; credits: number }
  | { state: "ya-acreditada"; credits: number }
  | { state: "pendiente" }
  | { state: "rechazada" }
  | { state: "desconocida" };

type PurchaseRow = {
  id: string;
  organization_id: string;
  credits: number | string;
  total_ars: number | string;
};

async function creditApprovedPayment(
  payment: MpPayment,
  purchase: PurchaseRow
): Promise<PurchaseOutcome> {
  const amountOk =
    payment.currency_id === "ARS" &&
    Number(payment.transaction_amount) + AMOUNT_TOLERANCE_ARS >=
      Number(purchase.total_ars);
  if (!amountOk) {
    console.error("Mercado Pago: el monto no coincide", payment.id);
    return { state: "desconocida" };
  }
  const { data: credited, error } = await createAdminClient().rpc(
    "commercial_ai_add_credits",
    {
      p_org: purchase.organization_id,
      p_credits: purchase.credits,
      p_kind: "compra",
      p_note: `Mercado Pago · pago ${payment.id}`,
      p_purchase: purchase.id,
      p_by: null,
    }
  );
  if (error) {
    throw new Error(error.message);
  }
  const credits = Number(purchase.credits);
  return credited
    ? { state: "acreditada", credits }
    : { state: "ya-acreditada", credits };
}

/**
 * Consulta el pago en Mercado Pago y, si está aprobado, acredita la compra.
 * Se puede llamar muchas veces con el mismo pago: acredita una sola vez.
 */
export async function settleCreditPayment(
  paymentId: string,
  expectedOrganizationId?: string
): Promise<PurchaseOutcome> {
  if (!PAYMENT_ID.test(paymentId)) {
    return { state: "desconocida" };
  }
  const response = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!response.ok) {
    return { state: "desconocida" };
  }
  const payment = (await response.json()) as MpPayment;
  if (!payment.external_reference) {
    return { state: "desconocida" };
  }
  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("commercial_ai_credit_purchases")
    .select("id, organization_id, credits, total_ars, status")
    .eq("id", payment.external_reference)
    .maybeSingle();
  if (
    !purchase ||
    (expectedOrganizationId &&
      purchase.organization_id !== expectedOrganizationId)
  ) {
    return { state: "desconocida" };
  }
  await admin
    .from("commercial_ai_credit_purchases")
    .update({ mp_payment_id: String(payment.id), mp_status: payment.status })
    .eq("id", purchase.id);

  if (payment.status === "approved") {
    return creditApprovedPayment(payment, purchase);
  }
  if (FINAL_REJECTED.has(payment.status) && purchase.status === "pendiente") {
    await admin
      .from("commercial_ai_credit_purchases")
      .update({ status: "rechazada" })
      .eq("id", purchase.id);
    return { state: "rechazada" };
  }
  return { state: "pendiente" };
}

/**
 * Firma del webhook (x-signature): HMAC-SHA256 con la clave secreta sobre
 * "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". Sin clave configurada no
 * se exige: igual cada pago se verifica contra la API.
 */
export function validWebhookSignature(params: {
  signature: string | null;
  requestId: string | null;
  dataId: string;
}): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    return true;
  }
  if (!params.signature) {
    return false;
  }
  const parts = new Map<string, string>();
  for (const part of params.signature.split(",")) {
    const match = SIGNATURE_PART.exec(part);
    if (match) {
      parts.set(match[1], match[2].trim());
    }
  }
  const ts = parts.get("ts");
  const v1 = parts.get("v1");
  if (!(ts && v1)) {
    return false;
  }
  const manifest = `id:${params.dataId.toLowerCase()};${params.requestId ? `request-id:${params.requestId};` : ""}ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
