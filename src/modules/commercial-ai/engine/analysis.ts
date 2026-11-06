/**
 * Motor de análisis de cartera (reglas, sin IA).
 *
 * Portado del prototipo "Cartera Viva": detecta clientes en riesgo, dormidos,
 * productos faltantes y oportunidades de cross-sell comparando a cada cliente
 * con sus pares. Es determinístico y puro: recibe ventas ya normalizadas y
 * devuelve métricas y oportunidades, así se puede testear sin base de datos.
 */

import { SIMILAR_PEERS } from "../constants";
import type {
  CommercialAiConfig,
  CustomerMetrics,
  EngineCustomer,
  EngineInput,
  EngineOrder,
  LeverKey,
  Opportunity,
  OpportunityStrategy,
  OpportunityType,
  SellerMonthProgress,
} from "../types";

const MS_PER_DAY = 86_400_000;
const DAYS_PER_MONTH = 30;
const HIGH_VALUE_VISIT_THRESHOLD = 900_000;
const PEER_ADJ_MIN = 0.5;
const PEER_ADJ_MAX = 1.6;
const CROSS_VALUE_FACTOR = 0.7;
const DORMANT_LOOKBACK_DAYS = 90;
const MONTHS_IN_LOOKBACK = 3;
const PRIORITY_BOOST = 1e12;

/* ============ Fechas y formato ============ */

export function toDayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromDayNumber(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function formatDayShort(day: number): string {
  const date = new Date(day * MS_PER_DAY);
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

const numberFormatter = new Intl.NumberFormat("es-AR");

export function formatMoney(value: number): string {
  return `$ ${numberFormatter.format(Math.round(value))}`;
}

/** Monto abreviado: $1,2M, $350k. */
export function formatMoneyShort(value: number): string {
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  if (abs >= 1e6) {
    return `$${(rounded / 1e6).toFixed(1).replace(".", ",")}M`;
  }
  if (abs >= 1e3) {
    return `$${Math.round(rounded / 1e3)}k`;
  }
  return `$${rounded}`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}

function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

function formatQuantity(quantity: number, unit: string | null): string {
  const rounded =
    quantity >= 10 ? Math.round(quantity) : Math.round(quantity * 10) / 10;
  const qty = numberFormatter.format(rounded);
  return unit ? `${qty} ${unit.toLowerCase()}` : `${qty} u.`;
}

/* ============ Utilidades numéricas ============ */

const sum = (values: number[]): number =>
  values.reduce((acc, value) => acc + value, 0);

export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function inWindow(orders: EngineOrder[], from: number, to: number) {
  return orders.filter((order) => order.day > from && order.day <= to);
}

function productSpend(orders: EngineOrder[], productId: string): number {
  let total = 0;
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.productId === productId) {
        total += line.amount;
      }
    }
  }
  return total;
}

function productIdSet(orders: EngineOrder[]): Set<string> {
  const ids = new Set<string>();
  for (const order of orders) {
    for (const line of order.lines) {
      ids.add(line.productId);
    }
  }
  return ids;
}

function topProduct(orders: EngineOrder[]): string | null {
  const totals = new Map<string, number>();
  for (const order of orders) {
    for (const line of order.lines) {
      totals.set(
        line.productId,
        (totals.get(line.productId) ?? 0) + line.amount
      );
    }
  }
  let best: string | null = null;
  let bestAmount = -1;
  for (const [productId, amount] of totals) {
    if (amount > bestAmount) {
      best = productId;
      bestAmount = amount;
    }
  }
  return best;
}

function typicalQuantity(orders: EngineOrder[], productId: string): number {
  const quantities: number[] = [];
  for (const order of orders) {
    for (const line of order.lines) {
      if (line.productId === productId && line.quantity > 0) {
        quantities.push(line.quantity);
      }
    }
  }
  return median(quantities);
}

/* ============ Métricas por cliente ============ */

type RiskDetail = {
  baseOrders: EngineOrder[];
  recentOrders: EngineOrder[];
  freqBase: number;
  freqRecent: number;
  amountBase: number;
  amountRecent: number;
  dropFreq: number;
  dropAmount: number;
  baseStart: number;
  recentStart: number;
};

type InternalMetrics = CustomerMetrics & {
  orders: EngineOrder[];
  risk: RiskDetail | null;
};

function computeRisk(
  orders: EngineOrder[],
  today: number,
  config: CommercialAiConfig
): RiskDetail | null {
  const recentStart = today - config.riesgoRec;
  const baseStart = recentStart - config.riesgoBase;
  const baseOrders = inWindow(orders, baseStart, recentStart);
  const recentOrders = inWindow(orders, recentStart, today);
  if (baseOrders.length < config.riesgoMin) {
    return null;
  }
  const freqBase = (baseOrders.length / config.riesgoBase) * DAYS_PER_MONTH;
  const freqRecent = (recentOrders.length / config.riesgoRec) * DAYS_PER_MONTH;
  const amountBase =
    (sum(baseOrders.map((o) => o.total)) / config.riesgoBase) * DAYS_PER_MONTH;
  const amountRecent =
    (sum(recentOrders.map((o) => o.total)) / config.riesgoRec) * DAYS_PER_MONTH;
  const dropFreq = 1 - freqRecent / freqBase;
  const dropAmount = amountBase > 0 ? 1 - amountRecent / amountBase : 0;
  if (Math.max(dropFreq, dropAmount) < config.riesgoCaida / 100) {
    return null;
  }
  return {
    baseOrders,
    recentOrders,
    freqBase,
    freqRecent,
    amountBase,
    amountRecent,
    dropFreq,
    dropAmount,
    baseStart,
    recentStart,
  };
}

function customerMetrics(
  orders: EngineOrder[],
  today: number,
  config: CommercialAiConfig
): InternalMetrics {
  const lastDay = orders.length ? (orders.at(-1)?.day ?? null) : null;
  const firstDay = orders.length ? orders[0].day : null;
  const daysSince = lastDay === null ? null : today - lastDay;
  const monthly =
    sum(inWindow(orders, today - config.ventana, today).map((o) => o.total)) /
    (config.ventana / DAYS_PER_MONTH);

  let status: CustomerMetrics["status"] = "activo";
  let risk: RiskDetail | null = null;
  const isDormant =
    config.dormOn &&
    daysSince !== null &&
    daysSince >= config.dormDias &&
    orders.length >= config.dormMin;

  if (isDormant) {
    status = "dormido";
  } else if (config.riesgoOn) {
    risk = computeRisk(orders, today, config);
    if (risk) {
      status = "riesgo";
    }
  }

  return {
    status,
    lastDay,
    firstDay,
    daysSince,
    orderCount: orders.length,
    monthly,
    orders,
    risk,
  };
}

/* ============ Textos de cada oportunidad ============ */

type TextContext = {
  orgName: string;
  sellerShortName: string;
  customer: EngineCustomer;
  productName: string;
  quantityText: string;
  categoryName: string;
  peersText: string;
};

type TextResult = {
  evidence: string;
  evidenceShort: string;
  strategy: OpportunityStrategy;
  message: string;
};

/** Pasa a minúscula la inicial ("Queso" → "queso") sin romper siglas o nombres en mayúsculas. */
// Siglas cortas sin vocales: LR, SRL, JJ.
const NO_VOWELS = /^[b-df-hj-np-tv-z]{2,4}$/i;
const INNER_CAPITAL = /\s\p{Lu}/u;
const WHITESPACE_SPLIT = /(\s+)/;

function lowerFirst(text: string): string {
  const second = text.charAt(1);
  const isCapitalizedWord = second !== "" && second === second.toLowerCase();
  // "Queso cremoso" → "queso cremoso"; "Productos Frescos Tropa" queda igual.
  const restHasCapitals = INNER_CAPITAL.test(text);
  return isCapitalizedWord && !restHasCapitals
    ? text.charAt(0).toLowerCase() + text.slice(1)
    : text;
}

const LOWER_WORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "e"]);
const KEEP_UPPER =
  /^(s\.?a\.?s?\.?|s\.?r\.?l\.?|s\.?a\.?c\.?i\.?|caba|[ivx]+)$/i;

/**
 * Los nombres vienen muchas veces en mayúsculas desde el ERP. Para los
 * mensajes al cliente los pasamos a "Tipo Título": RAMIRO → Ramiro,
 * CIUDAD AUTONOMA DE BUENOS AIRES → Ciudad Autonoma de Buenos Aires.
 * Si el texto ya tiene minúsculas, se respeta como está.
 */
export function niceName(text: string): string {
  if (!text || text !== text.toUpperCase()) {
    return text;
  }
  return text
    .toLowerCase()
    .split(WHITESPACE_SPLIT)
    .map((word, index) => {
      if (word.trim() === "") {
        return word;
      }
      if (KEEP_UPPER.test(word) || NO_VOWELS.test(word)) {
        return word.toUpperCase();
      }
      if (index > 0 && LOWER_WORDS.has(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join("");
}

/** "1,8 → 0,7 (−62 %)" o "(+14 %)" si subió. */
function changeText(before: string, after: string, drop: number): string {
  const pct = Math.round(Math.abs(drop) * 100);
  const sign = drop >= 0 ? "−" : "+";
  return `${before} → ${after} (${sign}${pct} %)`;
}

function greeting(ctx: TextContext): string {
  return `Hola, ¿cómo andás? Soy ${ctx.sellerShortName} de ${ctx.orgName}.`;
}

function riskTexts(
  ctx: TextContext,
  risk: RiskDetail,
  config: CommercialAiConfig,
  value: number
): TextResult {
  const byAmount = risk.dropAmount >= risk.dropFreq;
  const drop = Math.round(Math.max(risk.dropFreq, risk.dropAmount) * 100);
  const product = lowerFirst(ctx.productName);
  const place = ctx.customer.city ? ` por ${ctx.customer.city}` : "";
  const freqChange = changeText(
    formatDecimal(risk.freqBase),
    formatDecimal(risk.freqRecent),
    risk.dropFreq
  );
  const amountChange = changeText(
    formatMoneyShort(risk.amountBase),
    formatMoneyShort(risk.amountRecent),
    risk.dropAmount
  );
  const freqVerb = risk.dropFreq >= 0 ? "bajó" : "subió";
  return {
    evidence: `Entre el ${formatDayShort(risk.baseStart + 1)} y el ${formatDayShort(risk.recentStart)} hacía ${formatDecimal(risk.freqBase)} pedidos cada 30 días por ${formatMoneyShort(risk.amountBase)}/mes. En los últimos ${config.riesgoRec} días la frecuencia ${freqVerb} a ${formatDecimal(risk.freqRecent)} pedidos cada 30 días y el monto quedó en ${formatMoneyShort(risk.amountRecent)}/mes.`,
    evidenceShort: `Pedidos/mes ${freqChange} · Monto/mes ${amountChange} · últimos ${config.riesgoRec} d`,
    strategy: {
      con: `${ctx.productName}, que es lo que más dejó de pedir.`,
      porque: byAmount
        ? `Compra ${drop} % menos en plata que antes. Si no repone pronto, el próximo pedido se lo hace a otro proveedor.`
        : `Pide ${drop} % menos seguido que antes. Si no repone pronto, el próximo pedido se lo hace a otro proveedor.`,
      ofrecer: `Pasar a ver qué cambió y dejar armado un pedido de reposición de ${product}.`,
      canal: value >= HIGH_VALUE_VISIT_THRESHOLD ? "Visita" : "WhatsApp",
    },
    message: `${greeting(ctx)} Vi que estas últimas semanas repusieron menos ${product}. ¿Está todo bien con la mercadería o con las entregas? Si te sirve, esta semana paso${place} y lo charlamos. ¿Te reservo ${ctx.quantityText} de ${product} para el próximo reparto?`,
  };
}

function reactivateTexts(
  ctx: TextContext,
  detail: {
    since: number;
    last: number;
    count: number;
    ticket: number;
    freq: number;
  }
): TextResult {
  const product = lowerFirst(ctx.productName);
  const place = ctx.customer.city
    ? ` y repartimos en ${ctx.customer.city}`
    : "";
  return {
    evidence: `Última compra el ${formatDayShort(detail.last)} (hace ${detail.since} días). Tiene ${detail.count} pedidos en el historial y un ticket mediano de ${formatMoney(detail.ticket)}. Antes de cortar compraba ${formatDecimal(detail.freq)} veces por mes.`,
    evidenceShort: `Última compra ${formatDayShort(detail.last)} (hace ${detail.since} días) · ${detail.count} pedidos históricos`,
    strategy: {
      con: `${ctx.productName}, su producto más comprado.`,
      porque: `Lleva ${detail.since} días sin comprar. Cuanto más tiempo pasa, más difícil es recuperarlo.`,
      ofrecer:
        "Un pedido chico para volver a arrancar, con entrega en el próximo reparto de la zona.",
      canal: "Llamada",
    },
    message: `${greeting(ctx)} Hace un tiempo que no nos hacés pedido y quería saber cómo vienen. Esta semana tenemos ${product} con buen precio${place}. ¿Te armo un pedido chico para volver a arrancar?`,
  };
}

function missingTexts(
  ctx: TextContext,
  detail: {
    share: number;
    buyers: number;
    peers: number;
    lines: number;
    examples: string;
  },
  config: CommercialAiConfig
): TextResult {
  const product = lowerFirst(ctx.productName);
  const category = ctx.categoryName.toLowerCase();
  return {
    evidence: `Compra ${category} (${detail.lines} líneas en ${config.historia} días: ${detail.examples}) pero nunca pidió ${ctx.productName}. Lo compra el ${formatPercent(detail.share)} de ${ctx.peersText} (${detail.buyers} de ${detail.peers}).`,
    evidenceShort: `Compra ${category} pero nunca ${ctx.productName} · lo lleva el ${formatPercent(detail.share)} de sus pares`,
    strategy: {
      con: `${ctx.productName}: ya compra ${category} y le falta este.`,
      porque: `Lo compra el ${formatPercent(detail.share)} de ${ctx.peersText}. Es una venta fácil sobre un pedido que ya existe.`,
      ofrecer: `Sumar ${ctx.quantityText} de ${product} al próximo pedido para que lo prueben.`,
      canal: "WhatsApp",
    },
    message: `${greeting(ctx)} Vi que nos comprás ${category} pero todavía no probaste ${product}. Es de lo que más rota entre clientes como vos. ¿Te sumo ${ctx.quantityText} en el próximo pedido para que lo prueben?`,
  };
}

function crossTexts(
  ctx: TextContext,
  detail: { share: number; buyers: number; peers: number; tenure: number },
  config: CommercialAiConfig
): TextResult {
  const product = lowerFirst(ctx.productName);
  const category = ctx.categoryName.toLowerCase();
  return {
    evidence: `No compró ${category} en los últimos ${config.historia} días. El ${formatPercent(detail.share)} de ${ctx.peersText} sí (${detail.buyers} de ${detail.peers}); lo más pedido es ${ctx.productName}. Es cliente hace ${detail.tenure} días.`,
    evidenceShort: `No compra ${category} · el ${formatPercent(detail.share)} de sus pares sí`,
    strategy: {
      con: `${ctx.productName}, lo más pedido de ${category} entre sus pares.`,
      porque: "Es una categoría entera que hoy le compra a otro o no ofrece.",
      ofrecer:
        "Una muestra en la próxima entrega y precio de lanzamiento en el primer pedido.",
      canal: "Visita",
    },
    message: `${greeting(ctx)} Muchos clientes como vos ya suman ${category} a lo que nos compran, sobre todo ${product}. ¿Querés que te lleve una muestra en la próxima entrega?`,
  };
}

/* ============ Análisis completo ============ */

export type AnalysisResult = {
  metrics: Map<string, CustomerMetrics>;
  opportunities: Opportunity[];
  monthly: Map<string, number>;
  diagnostics: AnalysisDiagnostics;
};

type AnalysisOptions = {
  orgName: string;
  sellerShortName: (sellerId: string | null) => string;
};

type PeerGroup = {
  list: EngineCustomer[];
  scope: "canal-parecidos" | "canal" | "parecidos" | "cartera";
};

/** Parecido entre dos canastas: productos en común sobre productos totales. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let shared = 0;
  for (const item of small) {
    if (big.has(item)) {
      shared += 1;
    }
  }
  return shared / (a.size + b.size - shared);
}

/** De los candidatos, los que más se parecen en lo que compran. */
function mostSimilar(
  mine: Set<string>,
  candidates: EngineCustomer[],
  history: Map<string, Set<string>>
): EngineCustomer[] {
  return candidates
    .map((peer) => ({
      peer,
      score: jaccard(mine, history.get(peer.id) ?? new Set<string>()),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, SIMILAR_PEERS)
    .map((x) => x.peer);
}

function peersTextFor(
  scope: PeerGroup["scope"],
  channel: string | null
): string {
  const channelText = `clientes del canal ${channel?.toLowerCase() ?? ""}`;
  if (scope === "canal-parecidos") {
    return `${channelText} que compran parecido`;
  }
  if (scope === "canal") {
    return channelText;
  }
  if (scope === "parecidos") {
    return "los clientes que compran parecido";
  }
  return "clientes de la cartera";
}

export type AnalysisDiagnostics = {
  /** Clientes con canal cargado. */
  customersWithChannel: number;
  /** Productos vendidos en la historia que tienen categoría. */
  soldProducts: number;
  soldProductsWithCategory: number;
  /** Ventas sin detalle de productos (no sirven para faltante ni cross-sell). */
  ordersWithoutLines: number;
};

type BuildParams = {
  type: OpportunityType;
  productId: string | null;
  categoryId: string | null;
  value: number;
  texts: (ctx: TextContext) => TextResult;
  peerScope?: PeerGroup["scope"];
  quantity?: number;
};

function categorySpend(
  orders: EngineOrder[],
  categoryId: string,
  categoryOf: (productId: string) => string | null
): number {
  let total = 0;
  for (const order of orders) {
    for (const line of order.lines) {
      if (categoryOf(line.productId) === categoryId) {
        total += line.amount;
      }
    }
  }
  return total;
}

function opportunityPriority(opportunity: Opportunity): number {
  const isRetention =
    opportunity.type === "riesgo" || opportunity.type === "reactivar";
  return (isRetention ? PRIORITY_BOOST : 0) + opportunity.value;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: port directo del motor de reglas del prototipo; separar más fragmenta la lectura de cada regla
export function analyzePortfolio(
  input: EngineInput,
  options: AnalysisOptions
): AnalysisResult {
  const { today, config, customers, products, categories } = input;

  const ordersByCustomer = new Map<string, EngineOrder[]>();
  for (const customer of customers) {
    ordersByCustomer.set(customer.id, []);
  }
  const sortedOrders = [...input.orders].sort((a, b) => a.day - b.day);
  for (const order of sortedOrders) {
    ordersByCustomer.get(order.customerId)?.push(order);
  }

  const internal = new Map<string, InternalMetrics>();
  for (const customer of customers) {
    internal.set(
      customer.id,
      customerMetrics(ordersByCustomer.get(customer.id) ?? [], today, config)
    );
  }

  const recent = new Map<string, EngineOrder[]>();
  const historyOrdersOf = new Map<string, EngineOrder[]>();
  const history = new Map<string, Set<string>>();
  const monthly = new Map<string, number>();
  for (const customer of customers) {
    const orders = ordersByCustomer.get(customer.id) ?? [];
    const recentOrders = inWindow(orders, today - config.ventana, today);
    recent.set(customer.id, recentOrders);
    const historyOrders = inWindow(orders, today - config.historia, today);
    historyOrdersOf.set(customer.id, historyOrders);
    history.set(customer.id, productIdSet(historyOrders));
    monthly.set(
      customer.id,
      sum(recentOrders.map((o) => o.total)) / (config.ventana / DAYS_PER_MONTH)
    );
  }

  const active = customers.filter((customer) => {
    const metrics = internal.get(customer.id);
    return metrics && metrics.status !== "dormido" && metrics.orderCount > 0;
  });

  const peersOf = (customer: EngineCustomer): PeerGroup => {
    const sameChannel = active.filter(
      (peer) =>
        peer.id !== customer.id &&
        peer.channel !== null &&
        peer.channel === customer.channel
    );
    const everyone = active.filter((peer) => peer.id !== customer.id);
    // Si todo el canal es la cartera entera, el canal no aporta.
    const useChannel =
      sameChannel.length >= config.minPares &&
      sameChannel.length < everyone.length;
    const candidates = useChannel ? sameChannel : everyone;
    const similar = mostSimilar(
      history.get(customer.id) ?? new Set<string>(),
      candidates,
      history
    );
    if (
      similar.length >= config.minPares &&
      similar.length < candidates.length
    ) {
      return {
        list: similar,
        scope: useChannel ? "canal-parecidos" : "parecidos",
      };
    }
    return { list: candidates, scope: useChannel ? "canal" : "cartera" };
  };

  const categoryOf = (productId: string): string | null =>
    products.get(productId)?.categoryId ?? null;
  const productName = (productId: string | null): string =>
    (productId && products.get(productId)?.name) || "su producto principal";
  const unitOf = (productId: string | null): string | null =>
    (productId && products.get(productId)?.unit) || null;
  const categoryName = (categoryId: string | null): string =>
    (categoryId && categories.get(categoryId)) || "esa categoría";

  const opportunities: Opportunity[] = [];

  for (const customer of customers) {
    const metrics = internal.get(customer.id);
    if (!metrics || metrics.orderCount === 0) {
      continue;
    }
    const mine: Opportunity[] = [];
    const sellerShortName = options.sellerShortName(customer.sellerId);

    const build = ({
      type,
      productId,
      categoryId,
      value,
      texts,
      peerScope = "cartera",
      quantity = 0,
    }: BuildParams) => {
      const ctx: TextContext = {
        orgName: options.orgName,
        sellerShortName: niceName(sellerShortName),
        customer: {
          ...customer,
          city: customer.city ? niceName(customer.city) : null,
        },
        productName: niceName(productName(productId)),
        quantityText: formatQuantity(Math.max(1, quantity), unitOf(productId)),
        categoryName: niceName(
          categoryName(categoryId ?? (productId ? categoryOf(productId) : null))
        ),
        peersText: peersTextFor(peerScope, customer.channel),
      };
      const result = texts(ctx);
      mine.push({
        key: `${customer.id}:${type}:${productId ?? categoryId ?? "general"}`,
        customerId: customer.id,
        sellerId: customer.sellerId,
        type,
        productId,
        categoryId: categoryId ?? (productId ? categoryOf(productId) : null),
        value,
        ...result,
      });
    };

    if (metrics.status === "dormido" && metrics.lastDay !== null) {
      const lastQuarter = inWindow(
        metrics.orders,
        metrics.lastDay - DORMANT_LOOKBACK_DAYS,
        metrics.lastDay
      );
      const value = sum(lastQuarter.map((o) => o.total)) / MONTHS_IN_LOOKBACK;
      const top = topProduct(lastQuarter);
      const lastDay = metrics.lastDay;
      build({
        type: "reactivar",
        productId: top,
        categoryId: null,
        value,
        texts: (ctx) =>
          reactivateTexts(ctx, {
            since: metrics.daysSince ?? 0,
            last: lastDay,
            count: metrics.orderCount,
            ticket: median(metrics.orders.map((o) => o.total)),
            freq: lastQuarter.length / MONTHS_IN_LOOKBACK,
          }),
        quantity: top ? typicalQuantity(lastQuarter, top) : 0,
      });
    }

    if (metrics.status === "riesgo" && metrics.risk) {
      const risk = metrics.risk;
      let best: string | null = null;
      let bestDrop = Number.NEGATIVE_INFINITY;
      for (const productId of productIdSet(risk.baseOrders)) {
        const drop =
          (productSpend(risk.baseOrders, productId) / config.riesgoBase) *
            DAYS_PER_MONTH -
          (productSpend(risk.recentOrders, productId) / config.riesgoRec) *
            DAYS_PER_MONTH;
        if (drop > bestDrop) {
          bestDrop = drop;
          best = productId;
        }
      }
      const value = Math.max(0, risk.amountBase - risk.amountRecent);
      build({
        type: "riesgo",
        productId: best,
        categoryId: null,
        value,
        texts: (ctx) => riskTexts(ctx, risk, config, value),
        quantity: best ? typicalQuantity(risk.baseOrders, best) : 0,
      });
    }

    if (metrics.status !== "dormido") {
      const peers = peersOf(customer);
      if (peers.list.length > 0) {
        const peerMedian =
          median(peers.list.map((peer) => monthly.get(peer.id) ?? 0)) || 1;
        const adj = clamp(
          (monthly.get(customer.id) ?? 0) / peerMedian,
          PEER_ADJ_MIN,
          PEER_ADJ_MAX
        );
        const myHistory = history.get(customer.id) ?? new Set<string>();
        const historyCategories = new Set(
          [...myHistory].map(categoryOf).filter((c): c is string => !!c)
        );

        if (config.faltOn) {
          for (const categoryId of historyCategories) {
            for (const product of products.values()) {
              if (
                product.categoryId !== categoryId ||
                myHistory.has(product.id)
              ) {
                continue;
              }
              const buyers = peers.list.filter((peer) =>
                history.get(peer.id)?.has(product.id)
              );
              const share = buyers.length / peers.list.length;
              if (buyers.length === 0 || share < config.faltPct / 100) {
                continue;
              }
              const value =
                median(
                  buyers.map(
                    (peer) =>
                      productSpend(
                        historyOrdersOf.get(peer.id) ?? [],
                        product.id
                      ) /
                      (config.historia / DAYS_PER_MONTH)
                  )
                ) * adj;
              const myLines: string[] = [];
              for (const order of historyOrdersOf.get(customer.id) ?? []) {
                for (const line of order.lines) {
                  if (categoryOf(line.productId) === categoryId) {
                    myLines.push(line.productId);
                  }
                }
              }
              const examples = [...new Set(myLines)]
                .slice(0, 3)
                .map((id) => productName(id))
                .join(", ");
              const quantity = median(
                buyers.map((peer) =>
                  typicalQuantity(
                    historyOrdersOf.get(peer.id) ?? [],
                    product.id
                  )
                )
              );
              build({
                type: "faltante",
                productId: product.id,
                categoryId,
                value,
                texts: (ctx) =>
                  missingTexts(
                    ctx,
                    {
                      share,
                      buyers: buyers.length,
                      peers: peers.list.length,
                      lines: myLines.length,
                      examples,
                    },
                    config
                  ),
                peerScope: peers.scope,
                quantity,
              });
            }
          }
        }

        const tenure = metrics.firstDay === null ? 0 : today - metrics.firstDay;
        if (config.crossOn && tenure >= config.crossAnt) {
          for (const categoryId of categories.keys()) {
            if (historyCategories.has(categoryId)) {
              continue;
            }
            const buyers = peers.list.filter((peer) =>
              [...(history.get(peer.id) ?? [])].some(
                (productId) => categoryOf(productId) === categoryId
              )
            );
            const share = buyers.length / peers.list.length;
            if (buyers.length === 0 || share < config.crossPct / 100) {
              continue;
            }
            const value =
              median(
                buyers.map(
                  (peer) =>
                    categorySpend(
                      historyOrdersOf.get(peer.id) ?? [],
                      categoryId,
                      categoryOf
                    ) /
                    (config.historia / DAYS_PER_MONTH)
                )
              ) *
              adj *
              CROSS_VALUE_FACTOR;
            const counts = new Map<string, number>();
            for (const peer of buyers) {
              for (const productId of history.get(peer.id) ?? []) {
                if (categoryOf(productId) === categoryId) {
                  counts.set(productId, (counts.get(productId) ?? 0) + 1);
                }
              }
            }
            const top =
              [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
            build({
              type: "cross",
              productId: top,
              categoryId,
              value,
              texts: (ctx) =>
                crossTexts(
                  ctx,
                  {
                    share,
                    buyers: buyers.length,
                    peers: peers.list.length,
                    tenure,
                  },
                  config
                ),
              peerScope: peers.scope,
            });
          }
        }
      }
    }

    mine.sort((a, b) => opportunityPriority(b) - opportunityPriority(a));
    opportunities.push(...mine.slice(0, config.maxOpps));
  }

  opportunities.sort((a, b) => b.value - a.value);

  const metricsOut = new Map<string, CustomerMetrics>();
  for (const [customerId, metrics] of internal) {
    const { orders: _orders, risk: _risk, ...publicMetrics } = metrics;
    metricsOut.set(customerId, publicMetrics);
  }

  const soldProducts = new Set<string>();
  let ordersWithoutLines = 0;
  for (const order of input.orders) {
    if (order.day <= today - config.historia || order.day > today) {
      continue;
    }
    if (order.lines.length === 0) {
      ordersWithoutLines += 1;
    }
    for (const line of order.lines) {
      soldProducts.add(line.productId);
    }
  }
  const diagnostics: AnalysisDiagnostics = {
    customersWithChannel: customers.filter((c) => c.channel).length,
    soldProducts: soldProducts.size,
    soldProductsWithCategory: [...soldProducts].filter((id) => !!categoryOf(id))
      .length,
    ordersWithoutLines,
  };

  return { metrics: metricsOut, opportunities, monthly, diagnostics };
}

/* ============ Avance del mes por palanca ============ */

const RECOVERY_GAP_DAYS = 60;

/**
 * Reparte lo vendido en el mes en cuatro palancas:
 * - base: lo que compran los activos hasta su promedio de los 3 meses previos
 * - rec: clientes que vuelven tras 60+ días sin comprar
 * - vm: lo que compran por encima de su promedio
 * - nue: clientes sin compras previas
 */
export function monthProgressByCustomer(
  orders: EngineOrder[],
  monthStart: number
): { real: number; levers: Record<LeverKey, number> } {
  const levers: Record<LeverKey, number> = { base: 0, rec: 0, vm: 0, nue: 0 };
  const sorted = [...orders].sort((a, b) => a.day - b.day);
  const inMonth = sorted.filter((o) => o.day >= monthStart);
  const previous = sorted.filter((o) => o.day < monthStart);
  const monthTotal = sum(inMonth.map((o) => o.total));
  if (inMonth.length === 0) {
    return { real: 0, levers };
  }
  const lastPrevious = previous.at(-1);
  if (!lastPrevious) {
    levers.nue = monthTotal;
    return { real: monthTotal, levers };
  }
  if (inMonth[0].day - lastPrevious.day >= RECOVERY_GAP_DAYS) {
    levers.rec = monthTotal;
    return { real: monthTotal, levers };
  }
  const threeMonthsAgo = monthStart - DAYS_PER_MONTH * MONTHS_IN_LOOKBACK;
  const average =
    sum(previous.filter((o) => o.day >= threeMonthsAgo).map((o) => o.total)) /
    MONTHS_IN_LOOKBACK;
  levers.base = Math.min(monthTotal, average);
  levers.vm = Math.max(0, monthTotal - average);
  return { real: monthTotal, levers };
}

export function addProgress(
  target: SellerMonthProgress,
  value: { real: number; levers: Record<LeverKey, number> }
): void {
  target.real += value.real;
  for (const key of Object.keys(value.levers) as LeverKey[]) {
    target.levers[key] += value.levers[key];
  }
}

const SUGGESTED_RECOVERY_RATE = 0.3;
const SUGGESTED_UPSELL_RATE = 0.25;
const SUGGESTED_BASE_GROWTH = 0.06;
const SUGGESTED_BASE_RETENTION = 0.95;
const ROUND_TO = 100_000;

/** Meta sugerida para el mes que viene, a partir de la cartera y sus oportunidades. */
export function suggestPlan(params: {
  orders: EngineOrder[];
  isDormant: boolean;
  monthStart: number;
}): number {
  const threeMonthsAgo =
    params.monthStart - DAYS_PER_MONTH * MONTHS_IN_LOOKBACK;
  const average =
    sum(
      params.orders
        .filter((o) => o.day >= threeMonthsAgo && o.day < params.monthStart)
        .map((o) => o.total)
    ) / MONTHS_IN_LOOKBACK;
  return params.isDormant ? 0 : average * SUGGESTED_BASE_RETENTION;
}

export function suggestedLevers(
  baseAverage: number,
  opportunities: Opportunity[]
): Record<LeverKey, number> {
  let rec = 0;
  let vm = baseAverage * SUGGESTED_BASE_GROWTH;
  for (const opportunity of opportunities) {
    if (opportunity.type === "riesgo" || opportunity.type === "reactivar") {
      rec += opportunity.value * SUGGESTED_RECOVERY_RATE;
    } else {
      vm += opportunity.value * SUGGESTED_UPSELL_RATE;
    }
  }
  const round = (value: number) => Math.round(value / ROUND_TO) * ROUND_TO;
  return { base: round(baseAverage), rec: round(rec), vm: round(vm), nue: 0 };
}
