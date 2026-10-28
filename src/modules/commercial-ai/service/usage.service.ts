import "server-only";

import { createAdminClient } from "@/lib/supabase/admin-client";

export type AiFeature = "asistente" | "campana" | "prueba";

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

/** Tope por defecto si Rhinos todavía no le fijó uno a la organización. */
export function defaultMonthlyLimitUsd(): number {
  const value = Number(process.env.COMMERCIAL_AI_DEFAULT_MONTHLY_USD);
  return Number.isFinite(value) && value >= 0 ? value : 2;
}

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
  monthlyUsdLimit: number | null;
  perUserMonthlyUsdLimit: number | null;
  notes: string;
  isDefault: boolean;
  updatedAt: string | null;
};

export async function getOrgLimits(organizationId: string): Promise<OrgLimits> {
  const { data } = await createAdminClient()
    .from("commercial_ai_limits")
    .select("monthly_usd_limit, per_user_monthly_usd_limit, notes, updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) {
    return {
      monthlyUsdLimit: defaultMonthlyLimitUsd(),
      perUserMonthlyUsdLimit: null,
      notes: "",
      isDefault: true,
      updatedAt: null,
    };
  }
  const toNumber = (value: unknown) => (value === null ? null : Number(value));
  return {
    monthlyUsdLimit: toNumber(data.monthly_usd_limit),
    perUserMonthlyUsdLimit: toNumber(data.per_user_monthly_usd_limit),
    notes: (data.notes as string) ?? "",
    isDefault: false,
    updatedAt: data.updated_at as string,
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
  created_at: string;
};

async function monthRows(organizationId: string): Promise<UsageRow[]> {
  const { data, error } = await createAdminClient()
    .from("commercial_ai_usage")
    .select(
      "user_id, user_name, feature, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd, created_at"
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

/** Frena la llamada si la organización o el empleado ya llegaron a su tope del mes. */
export async function assertWithinBudget(meter: AiMeter): Promise<void> {
  const [limits, rows] = await Promise.all([
    getOrgLimits(meter.organizationId),
    monthRows(meter.organizationId),
  ]);
  const orgSpent = rows.reduce((acc, row) => acc + Number(row.cost_usd), 0);
  if (limits.monthlyUsdLimit !== null && orgSpent >= limits.monthlyUsdLimit) {
    throw new AiBudgetExceededError(
      `La empresa llegó a su tope de IA de este mes (US$${limits.monthlyUsdLimit.toFixed(2)}). Pedile a Rhinos que lo amplíe.`
    );
  }
  if (limits.perUserMonthlyUsdLimit !== null) {
    const userSpent = rows
      .filter((row) => row.user_id === meter.userId)
      .reduce((acc, row) => acc + Number(row.cost_usd), 0);
    if (userSpent >= limits.perUserMonthlyUsdLimit) {
      throw new AiBudgetExceededError(
        "Llegaste a tu tope personal de IA de este mes. Hablá con tu gerente."
      );
    }
  }
}

export async function recordUsage(
  meter: AiMeter,
  model: string,
  usage: TokenUsage
): Promise<void> {
  const { error } = await createAdminClient()
    .from("commercial_ai_usage")
    .insert({
      organization_id: meter.organizationId,
      user_id: meter.userId,
      user_name: meter.userName,
      feature: meter.feature,
      model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      cache_read_tokens: usage.cacheReadTokens,
      cache_write_tokens: usage.cacheWriteTokens,
      cost_usd: costUsd(model, usage),
    });
  if (error) {
    console.warn(
      `IA Comercial: no se pudo registrar el consumo: ${error.message}`
    );
  }
}

/* ============ Resumen para pantallas ============ */

export type UsageBucket = {
  key: string;
  label: string;
  calls: number;
  tokens: number;
  costUsd: number;
};

export type UsageSummary = {
  periodStart: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  costUsd: number;
  limits: OrgLimits;
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
  }[];
};

const FEATURE_LABELS: Record<AiFeature, string> = {
  asistente: "Asistente",
  campana: "Campañas",
  prueba: "Prueba de conexión",
};
const RECENT_LIMIT = 20;

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
    };
    bucket.calls += 1;
    bucket.tokens +=
      row.input_tokens +
      row.output_tokens +
      row.cache_read_tokens +
      row.cache_write_tokens;
    bucket.costUsd += Number(row.cost_usd);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => b.costUsd - a.costUsd);
}

export async function getUsageSummary(
  organizationId: string
): Promise<UsageSummary> {
  const [limits, rows] = await Promise.all([
    getOrgLimits(organizationId),
    monthRows(organizationId),
  ]);
  return {
    periodStart: monthStartIso(),
    calls: rows.length,
    inputTokens: rows.reduce((acc, r) => acc + r.input_tokens, 0),
    outputTokens: rows.reduce((acc, r) => acc + r.output_tokens, 0),
    cacheTokens: rows.reduce(
      (acc, r) => acc + r.cache_read_tokens + r.cache_write_tokens,
      0
    ),
    costUsd: rows.reduce((acc, r) => acc + Number(r.cost_usd), 0),
    limits,
    byUser: bucketize(
      rows,
      (r) => r.user_id ?? "sistema",
      (r) => r.user_name ?? "Sistema"
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
      tokens:
        r.input_tokens +
        r.output_tokens +
        r.cache_read_tokens +
        r.cache_write_tokens,
      costUsd: Number(r.cost_usd),
    })),
  };
}
