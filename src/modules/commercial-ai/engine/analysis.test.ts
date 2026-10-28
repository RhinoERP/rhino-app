import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMMERCIAL_AI_CONFIG,
  type EngineCustomer,
  type EngineOrder,
  type EngineProduct,
} from "../types";
import {
  analyzePortfolio,
  formatMoneyShort,
  monthProgressByCustomer,
  toDayNumber,
} from "./analysis";

const TODAY = toDayNumber("2026-10-20");

function customer(id: string, sellerId = "s1"): EngineCustomer {
  return {
    id,
    name: `Cliente ${id}`,
    city: "CABA",
    channel: "DISTRIBUIDORA",
    sellerId,
    phone: null,
    email: null,
    creditLimit: null,
  };
}

let seq = 0;
function order(
  customerId: string,
  daysAgo: number,
  lines: [string, number][]
): EngineOrder {
  seq += 1;
  const mapped = lines.map(([productId, amount]) => ({
    productId,
    quantity: 2,
    amount,
  }));
  return {
    id: `o${seq}`,
    number: null,
    customerId,
    day: TODAY - daysAgo,
    total: mapped.reduce((a, l) => a + l.amount, 0),
    lines: mapped,
  };
}

const products = new Map<string, EngineProduct>([
  [
    "queso",
    { id: "queso", name: "Queso cremoso", categoryId: "quesos", unit: "kg" },
  ],
  [
    "muzza",
    { id: "muzza", name: "Mozzarella", categoryId: "quesos", unit: "kg" },
  ],
  [
    "jamon",
    { id: "jamon", name: "Jamón cocido", categoryId: "fiambres", unit: "kg" },
  ],
]);
const categories = new Map([
  ["quesos", "Quesos"],
  ["fiambres", "Fiambres"],
]);

function run(customers: EngineCustomer[], orders: EngineOrder[]) {
  return analyzePortfolio(
    {
      today: TODAY,
      customers,
      orders,
      products,
      categories,
      config: DEFAULT_COMMERCIAL_AI_CONFIG,
    },
    { orgName: "La Distribuidora", sellerShortName: () => "Sofía" }
  );
}

/** Cliente que compra cada `every` días durante `span` días. */
function regular({
  customerId,
  every,
  span,
  lines,
  from = 0,
}: {
  customerId: string;
  every: number;
  span: number;
  lines: [string, number][];
  from?: number;
}) {
  const orders: EngineOrder[] = [];
  for (let d = from; d < span; d += every) {
    orders.push(order(customerId, d, lines));
  }
  return orders;
}

describe("analyzePortfolio", () => {
  it("marca dormido al que no compra hace más de 60 días y sugiere reactivarlo", () => {
    const orders = regular({
      customerId: "a",
      every: 7,
      span: 200,
      lines: [["queso", 10_000]],
      from: 80,
    });
    const result = run([customer("a")], orders);
    expect(result.metrics.get("a")?.status).toBe("dormido");
    const opp = result.opportunities.find((o) => o.customerId === "a");
    expect(opp?.type).toBe("reactivar");
    expect(opp?.message).toContain("Sofía de La Distribuidora");
  });

  it("marca en riesgo al que cayó más de 40 % frente a su base", () => {
    const base = regular({
      customerId: "b",
      every: 5,
      span: 165,
      lines: [["queso", 10_000]],
      from: 45,
    });
    const recent = [order("b", 20, [["queso", 10_000]])];
    const result = run([customer("b")], [...base, ...recent]);
    expect(result.metrics.get("b")?.status).toBe("riesgo");
    expect(result.opportunities[0]?.type).toBe("riesgo");
    expect(result.opportunities[0]?.productId).toBe("queso");
  });

  it("detecta producto faltante cuando la mayoría de los pares lo compra", () => {
    const peers = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const orders = [
      ...regular({
        customerId: "c",
        every: 10,
        span: 200,
        lines: [["queso", 8000]],
      }),
      ...peers.flatMap((id) =>
        regular({
          customerId: id,
          every: 10,
          span: 200,
          lines: [
            ["queso", 8000],
            ["muzza", 6000],
          ],
        })
      ),
    ];
    const result = run(
      [customer("c"), ...peers.map((id) => customer(id))],
      orders
    );
    const missing = result.opportunities.find(
      (o) => o.customerId === "c" && o.type === "faltante"
    );
    expect(missing?.productId).toBe("muzza");
    expect(missing?.value).toBeGreaterThan(0);
  });

  it("sugiere cross-sell de una categoría que no compra", () => {
    const peers = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const orders = [
      ...regular({
        customerId: "d",
        every: 10,
        span: 200,
        lines: [["queso", 8000]],
      }),
      ...peers.flatMap((id) =>
        regular({
          customerId: id,
          every: 10,
          span: 200,
          lines: [
            ["queso", 8000],
            ["jamon", 9000],
          ],
        })
      ),
    ];
    const result = run(
      [customer("d"), ...peers.map((id) => customer(id))],
      orders
    );
    const cross = result.opportunities.find(
      (o) => o.customerId === "d" && o.type === "cross"
    );
    expect(cross?.categoryId).toBe("fiambres");
  });

  it("no genera nada para un cliente estable sin pares", () => {
    const result = run(
      [customer("e")],
      regular({
        customerId: "e",
        every: 7,
        span: 200,
        lines: [["queso", 10_000]],
      })
    );
    expect(result.metrics.get("e")?.status).toBe("activo");
    expect(result.opportunities).toHaveLength(0);
  });
});

describe("monthProgressByCustomer", () => {
  const monthStart = toDayNumber("2026-10-01");

  it("cuenta como nuevo al cliente sin compras previas", () => {
    const progress = monthProgressByCustomer(
      [order("x", 5, [["queso", 1000]])],
      monthStart
    );
    expect(progress.levers.nue).toBe(1000);
  });

  it("separa base y venderle más según el promedio previo", () => {
    const previous = [40, 70, 100].map((d) => order("y", d, [["queso", 1000]]));
    const progress = monthProgressByCustomer(
      [...previous, order("y", 5, [["queso", 3000]])],
      monthStart
    );
    expect(progress.levers.base).toBeCloseTo(1000);
    expect(progress.levers.vm).toBeCloseTo(2000);
  });
});

describe("formatMoneyShort", () => {
  it("abrevia millones y miles", () => {
    expect(formatMoneyShort(1_250_000)).toBe("$1,3M");
    expect(formatMoneyShort(350_400)).toBe("$350k");
  });
});
