import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-client";
import {
  type CreditPlan,
  type CreditStatus,
  creditStatus,
  creditsForUsd,
  DEFAULT_MONTHLY_CREDITS,
  type WalletState,
} from "../credits";
import { notifyLowCredits } from "./credit-alerts.service";

export type AiFeature =
  | "asistente"
  | "campana"
  | "prueba"
  | "whatsapp"
  | "audio"
  | "factura";

/** Quién consume: se registra en cada llamada y se usa para chequear el tope. */
export type AiMeter = {
  organizationId: string;
  userId: string;
  userName: string;
  feature: AiFeature;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/** US$ por millón de tokens (lista de precios de Anthropic, octubre 2026). */
type ModelPrice = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

const PRICES: Record<string, ModelPrice> = {
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
  },
  "claude-sonnet-5-5": {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
  },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-fable-5-1": {
    input: 10,
    output: 50,
    cacheRead: 0.25,
    cacheWrite: 12.5,
  },
};
// Para un modelo que no está en la lista usamos el precio más alto: mejor sobreestimar.
const FALLBACK_PRICE = PRICES["claude-fable-5-1"];
const TOKENS_PER_MILLION = 1_000_000;

export function costUsd(model: string, usage: TokenUsage): number {
  const price = PRICES[model] ?? FALLBACK_PRICE;
  return (
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    TOKENS_PER_MILLION
  );
}

export function monthStartIso(now = new Date()): string {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(now);
  // Medianoche del día 1 en Buenos Aires (UTC−3).
  return `${local.slice(0, 7)}-01T03:00:00.000Z`;
}

export type OrgLimits = {
  /** Créditos del plan por mes. null = sin tope (se mide, no se corta). */
  monthlyIncludedCredits: number | null;
  perUserMonthlyCredits: number | null;
  notes: string;
  isDefault: boolean;
  updatedAt: string | null;
};

/** Créditos por mes si Rhinos todavía no le fijó un plan a la empresa. */
export function defaultMonthlyCredits(): number {
  const value = Number(process.env.COMMERCIAL_AI_DEFAULT_MONTHLY_CREDITS);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MONTHLY_CREDITS;
}

export async function getOrgLimits(organizationId: string): Promise<OrgLimits> {
  const { data } = await createAdminClient()
    .from("commercial_ai_limits")
    .select(
      "monthly_included_credits, per_user_monthly_credits, unlimited, notes, updated_at"
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) {
    return {
      monthlyIncludedCredits: defaultMonthlyCredits(),
      perUserMonthlyCredits: null,
      notes: "",
      isDefault: true,
      updatedAt: null,
    };
  }
  const toNumber = (value: unknown) =>
    value === null || value === undefined ? null : Number(value);
  return {
    monthlyIncludedCredits: data.unlimited
      ? null
      : (toNumber(data.monthly_included_credits) ?? defaultMonthlyCredits()),
    perUserMonthlyCredits: toNumber(data.per_user_monthly_credits),
    notes: (data.notes as string) ?? "",
    isDefault: false,
    updatedAt: data.updated_at as string,
  };
}

function currentMonth(now = new Date()): string {
  return `${monthStartIso(now).slice(0, 7)}-01`;
}

/** Lo usado en el mes y el saldo comprado (con el mes ya renovado si cambió). */
export async function getWallet(organizationId: string): Promise<WalletState> {
  const { data, error } = await createAdminClient()
    .from("commercial_ai_wallets")
    .select("month, month_used, extra_balance")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) {
    return { monthUsed: 0, extraBalance: 0 };
  }
  return {
    monthUsed: data.month === currentMonth() ? Number(data.month_used) : 0,
    extraBalance: Number(data.extra_balance),
  };
}

export async function getCreditStatus(
  organizationId: string
): Promise<CreditStatus> {
  const [limits, wallet] = await Promise.all([
    getOrgLimits(organizationId),
    getWallet(organizationId),
  ]);
  return creditStatus(planOf(limits), wallet);
}

function planOf(limits: OrgLimits): CreditPlan {
  return {
    monthlyIncluded: limits.monthlyIncludedCredits,
    perUserMonthly: limits.perUserMonthlyCredits,
  };
}

type UsageRow = {
  user_id: string | null;
  user_name: string | null;
  feature: AiFeature;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number | string;
  credits: number | string;
  created_at: string;
};

async function monthRows(organizationId: string): Promise<UsageRow[]> {
  const { data, error } = await createAdminClient()
    .from("commercial_ai_usage")
    .select(
      "user_id, user_name, feature, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, credits, created_at"
    )
    .eq("organization_id", organizationId)
    .gte("created_at", monthStartIso())
    .order("created_at", { ascending: false })
    .limit(10_000);
  if (error) {
    // Si la tabla todavía no existe, no bloqueamos: se mide desde que exista.
    console.warn(`IA Comercial (consumo): ${error.message}`);
    return [];
  }
  return (data ?? []) as UsageRow[];
}

export class AiBudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiBudgetExceededError";
  }
}

export const OUT_OF_CREDITS_MESSAGE =
  "Tu empresa se quedó sin créditos de IA Comercial. El administrador puede comprar más en IA Comercial → Configuración → Consumo.";

/** Frena si la empresa no tiene créditos o el empleado llegó a su tope del mes. */
export async function assertWithinBudget(
  meter: Pick<AiMeter, "organizationId" | "userId">
): Promise<void> {
  const [limits, wallet] = await Promise.all([
    getOrgLimits(meter.organizationId),
    getWallet(meter.organizationId),
  ]);
  const status = creditStatus(planOf(limits), wallet);
  if (status.level === "agotado") {
    throw new AiBudgetExceededError(OUT_OF_CREDITS_MESSAGE);
  }
  if (limits.perUserMonthlyCredits !== null) {
    const { data } = await createAdminClient()
      .from("commercial_ai_usage")
      .select("credits")
      .eq("organization_id", meter.organizationId)
      .eq("user_id", meter.userId)
      .gte("created_at", monthStartIso())
      .limit(10_000);
    const used = (data ?? []).reduce(
      (acc, row) => acc + Number(row.credits ?? 0),
      0
    );
    if (used >= limits.perUserMonthlyCredits) {
      throw new AiBudgetExceededError(
        "Llegaste a tu tope personal de créditos de este mes. Hablá con tu gerente."
      );
    }
  }
}

type Charge = {
  feature: AiFeature;
  model: string;
  costUsd: number;
  tokens?: TokenUsage;
};

/** Registra un consumo (IA, WhatsApp o audio) y descuenta sus créditos. */
export async function chargeUsage(meter: AiMeter, charge: Charge) {
  const admin = createAdminClient();
  const credits = creditsForUsd(charge.costUsd);
  const { error } = await admin.from("commercial_ai_usage").insert({
    organization_id: meter.organizationId,
    user_id: meter.userId,
    user_name: meter.userName || null,
    feature: charge.feature,
    model: charge.model,
    input_tokens: charge.tokens?.inputTokens ?? 0,
    output_tokens: charge.tokens?.outputTokens ?? 0,
    cache_read_tokens: charge.tokens?.cacheReadTokens ?? 0,
    cache_write_tokens: charge.tokens?.cacheWriteTokens ?? 0,
    cost_usd: charge.costUsd,
    credits,
  });
  if (error) {
    console.warn(
      `IA Comercial: no se pudo registrar el consumo: ${error.message}`
    );
    return;
  }
  const limits = await getOrgLimits(meter.organizationId);
  const { data, error: chargeError } = await admin.rpc(
    "commercial_ai_charge_credits",
    {
      p_org: meter.organizationId,
      p_credits: credits,
      // Sin tope: todo cuenta como plan y nunca toca los comprados.
      p_included: limits.monthlyIncludedCredits ?? UNLIMITED_PLAN,
    }
  );
  if (chargeError) {
    console.warn(
      `IA Comercial: no se pudieron descontar créditos: ${chargeError.message}`
    );
    return;
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { month_used: number | string; extra_balance: number | string }
    | undefined;
  if (row && limits.monthlyIncludedCredits !== null) {
    const status = creditStatus(planOf(limits), {
      monthUsed: Number(row.month_used),
      extraBalance: Number(row.extra_balance),
    });
    if (status.level !== "ok") {
      await notifyLowCredits(meter.organizationId, status).catch(
        (alertError: unknown) => {
          console.warn("IA Comercial: no se pudo avisar créditos", alertError);
        }
      );
    }
  }
}

const UNLIMITED_PLAN = 1_000_000_000;

export function recordUsage(
  meter: AiMeter,
  model: string,
  usage: TokenUsage
): Promise<void> {
  return chargeUsage(meter, {
    feature: meter.feature,
    model,
    costUsd: costUsd(model, usage),
    tokens: usage,
  });
}

/* ============ Resumen para pantallas ============ */

export type UsageBucket = {
  key: string;
  label: string;
  calls: number;
  tokens: number;
  costUsd: number;
  credits: number;
};

export type CreditPackageView = {
  key: string;
  name: string;
  credits: number;
  priceUsd: number;
};

export type CreditPurchaseView = {
  id: string;
  createdAt: string;
  packageName: string;
  credits: number;
  totalArs: number;
  status: string;
};

export type CreditMovementView = {
  createdAt: string;
  kind: "compra" | "ajuste";
  credits: number;
  note: string;
};

export type UsageSummary = {
  periodStart: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  costUsd: number;
  credits: number;
  limits: OrgLimits;
  status: CreditStatus;
  packages: CreditPackageView[];
  purchases: CreditPurchaseView[];
  movements: CreditMovementView[];
  byUser: UsageBucket[];
  byFeature: UsageBucket[];
  byModel: UsageBucket[];
  recent: {
    createdAt: string;
    userName: string | null;
    feature: AiFeature;
    model: string;
    tokens: number;
    costUsd: number;
    credits: number;
  }[];
};

export const FEATURE_LABELS: Record<AiFeature, string> = {
  asistente: "Asistente (IA)",
  campana: "Campañas (IA)",
  prueba: "Prueba de conexión",
  whatsapp: "Mensajes de WhatsApp",
  audio: "Audios transcriptos",
  factura: "Facturas leídas (Compras)",
};
const RECENT_LIMIT = 20;
const HISTORY_LIMIT = 10;
const SYSTEM_LABEL = "Sistema";

function rowTokens(row: UsageRow): number {
  return (
    row.input_tokens +
    row.output_tokens +
    row.cache_read_tokens +
    row.cache_write_tokens
  );
}

function bucketize(
  rows: UsageRow[],
  keyOf: (row: UsageRow) => string,
  labelOf: (row: UsageRow) => string
): UsageBucket[] {
  const buckets = new Map<string, UsageBucket>();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = buckets.get(key) ?? {
      key,
      label: labelOf(row),
      calls: 0,
      tokens: 0,
      costUsd: 0,
      credits: 0,
    };
    // Los mensajes de WhatsApp a veces no traen el nombre: se toma el de otra fila.
    if (bucket.label === SYSTEM_LABEL && row.user_name) {
      bucket.label = labelOf(row);
    }
    bucket.calls += 1;
    bucket.tokens += rowTokens(row);
    bucket.costUsd += Number(row.cost_usd);
    bucket.credits += Number(row.credits);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.credits - a.credits);
}

async function creditHistory(organizationId: string) {
  const admin = createAdminClient();
  const [packages, purchases, movements] = await Promise.all([
    admin
      .from("commercial_ai_credit_packages")
      .select("key, name, credits, price_usd")
      .eq("active", true)
      .order("sort"),
    admin
      .from("commercial_ai_credit_purchases")
      .select("id, created_at, package_key, credits, total_ars, status")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    admin
      .from("commercial_ai_credit_movements")
      .select("created_at, kind, credits, note")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  const packageList: CreditPackageView[] = (packages.data ?? []).map((p) => ({
    key: p.key as string,
    name: p.name as string,
    credits: Number(p.credits),
    priceUsd: Number(p.price_usd),
  }));
  const names = new Map(packageList.map((p) => [p.key, p.name]));
  return {
    packages: packageList,
    purchases: (purchases.data ?? []).map((p) => ({
      id: p.id as string,
      createdAt: p.created_at as string,
      packageName: names.get(p.package_key as string) ?? String(p.package_key),
      credits: Number(p.credits),
      totalArs: Number(p.total_ars),
      status: p.status as string,
    })),
    movements: (movements.data ?? []).map((m) => ({
      createdAt: m.created_at as string,
      kind: m.kind as "compra" | "ajuste",
      credits: Number(m.credits),
      note: (m.note as string) ?? "",
    })),
  };
}

export async function getUsageSummary(
  organizationId: string
): Promise<UsageSummary> {
  const [limits, wallet, rows, history] = await Promise.all([
    getOrgLimits(organizationId),
    getWallet(organizationId),
    monthRows(organizationId),
    creditHistory(organizationId),
  ]);
  const aiRows = rows.filter(
    (r) => r.feature !== "whatsapp" && r.feature !== "audio"
  );
  return {
    periodStart: monthStartIso(),
    calls: aiRows.length,
    inputTokens: rows.reduce((acc, r) => acc + r.input_tokens, 0),
    outputTokens: rows.reduce((acc, r) => acc + r.output_tokens, 0),
    cacheTokens: rows.reduce(
      (acc, r) => acc + r.cache_read_tokens + r.cache_write_tokens,
      0
    ),
    costUsd: rows.reduce((acc, r) => acc + Number(r.cost_usd), 0),
    credits: rows.reduce((acc, r) => acc + Number(r.credits), 0),
    limits,
    status: creditStatus(planOf(limits), wallet),
    ...history,
    byUser: bucketize(
      rows,
      (r) => r.user_id ?? "sistema",
      (r) => r.user_name ?? SYSTEM_LABEL
    ),
    byFeature: bucketize(
      rows,
      (r) => r.feature,
      (r) => FEATURE_LABELS[r.feature] ?? r.feature
    ),
    byModel: bucketize(
      rows,
      (r) => r.model,
      (r) => r.model
    ),
    recent: rows.slice(0, RECENT_LIMIT).map((r) => ({
      createdAt: r.created_at,
      userName: r.user_name,
      feature: r.feature,
      model: r.model,
      tokens: rowTokens(r),
      costUsd: Number(r.cost_usd),
      credits: Number(r.credits),
    })),
  };
}
