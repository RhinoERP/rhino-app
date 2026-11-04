import { describe, expect, it } from "vitest";
import type { CommercialAiSnapshot } from "../types";
import {
  dayDigest,
  normalizePhone,
  parseQuickCommand,
  pendingText,
  phoneKey,
  routeText,
  toWhatsAppText,
} from "./format";

describe("normalizePhone", () => {
  it("lleva un celular argentino local al formato de Meta", () => {
    expect(normalizePhone("11 2345-6789")).toBe("5491123456789");
    expect(normalizePhone("011 2345 6789")).toBe("5491123456789");
    expect(normalizePhone("+54 11 2345 6789")).toBe("5491123456789");
    expect(normalizePhone("+54 9 11 2345 6789")).toBe("5491123456789");
  });

  it("rechaza lo que no es un teléfono", () => {
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone("hola")).toBeNull();
  });

  it("compara por los últimos 10 dígitos", () => {
    expect(phoneKey("5491123456789")).toBe(phoneKey("541123456789"));
  });
});

describe("parseQuickCommand", () => {
  it("reconoce los atajos sin importar tildes ni signos", () => {
    expect(parseQuickCommand("Hoy")).toBe("dia");
    expect(parseQuickCommand("Ver mi día")).toBe("dia");
    expect(parseQuickCommand("¿qué tengo hoy?")).toBe("dia");
    expect(parseQuickCommand("ruta")).toBe("ruta");
    expect(parseQuickCommand("Pendientes")).toBe("pendientes");
    expect(parseQuickCommand("ayuda")).toBe("ayuda");
  });

  it("deja el resto para la IA", () => {
    expect(parseQuickCommand("pasé por El Obrero")).toBeNull();
  });
});

describe("toWhatsAppText", () => {
  it("saca los links de la app y adapta negrita y viñetas", () => {
    expect(
      toWhatsAppText("**Ojo:**\n- [[cli:abc|El Obrero]] debe $1M\n- otro")
    ).toBe("*Ojo:*\n• El Obrero debe $1M\n• otro");
  });
});

function snapshot(
  overrides: Partial<CommercialAiSnapshot> = {}
): CommercialAiSnapshot {
  const base = {
    today: "2026-11-04",
    currentUserId: "u1",
    currentUserName: "RAMIRO ISAAC",
    customers: [
      {
        id: "c1",
        name: "EL OBRERO S.A.",
        sellerId: "u1",
        overdue: 1_500_000,
        maxDaysLate: 12,
      },
      { id: "c2", name: "Otro", sellerId: "u2", overdue: 9_000_000 },
    ],
    opportunities: [
      {
        sellerId: "u1",
        customerName: "LACTEOS CATAMARCA",
        value: 2_000_000,
        effectiveStage: "nueva",
        evidenceShort: "Pedidos/mes 4,5 → 1,3 (−70 %)",
      },
      {
        sellerId: "u1",
        customerName: "Ganada SA",
        value: 9_000_000,
        effectiveStage: "ganada",
        evidenceShort: "",
      },
    ],
    tasks: [
      {
        id: "t1",
        customerId: "c1",
        sellerId: "u1",
        body: "Llevar muestra",
        dueDate: "2026-11-03",
        doneAt: null,
      },
      {
        id: "t2",
        customerId: "c1",
        sellerId: "u1",
        body: "Futuro",
        dueDate: "2026-11-10",
        doneAt: null,
      },
    ],
    plan: {
      dayOfMonth: 4,
      daysInMonth: 30,
      sellers: [{ sellerId: "u1", real: 1_000_000, target: 10_000_000 }],
    },
    prospecting: {
      routes: [
        {
          id: "r1",
          sellerId: "u1",
          date: "2026-11-04",
          stops: [
            {
              id: "s2",
              position: 2,
              kind: "cliente",
              accountId: "c2",
              name: "SEGUNDA",
              city: null,
              reason: "",
              result: null,
            },
            {
              id: "s1",
              position: 1,
              kind: "cliente",
              accountId: "c1",
              name: "EL OBRERO S.A.",
              city: "SAN PEDRO",
              reason: "En riesgo",
              result: "pedido",
            },
          ],
        },
      ],
    },
  };
  return { ...base, ...overrides } as unknown as CommercialAiSnapshot;
}

describe("dayDigest", () => {
  it("arma el día del vendedor con meta, ruta, llamadas, pendientes y deuda", () => {
    const text = dayDigest(snapshot());
    expect(text).toContain("Buen día Ramiro");
    expect(text).toContain("$1,0M de $10,0M (10 %");
    expect(text).toContain("✅ El Obrero S.A. (San Pedro) · En riesgo");
    expect(text).toContain("2. Segunda");
    expect(text).toContain("Lacteos Catamarca");
    expect(text).not.toContain("Ganada SA");
    expect(text).toContain("Llevar muestra (atrasado)");
    expect(text).not.toContain("Futuro");
    expect(text).toContain("$1,5M vencido (12 días)");
    expect(text).not.toContain("$9,0M vencido");
  });

  it("avisa si no hay nada urgente", () => {
    const text = dayDigest(
      snapshot({
        customers: [],
        opportunities: [],
        tasks: [],
        plan: { dayOfMonth: 1, daysInMonth: 30, sellers: [] },
        prospecting: { routes: [] },
      } as unknown as Partial<CommercialAiSnapshot>)
    );
    expect(text).toContain("no tenés nada urgente");
  });
});

describe("ruta y pendientes", () => {
  it("ordena la ruta por posición", () => {
    const text = routeText(snapshot());
    expect(text.indexOf("El Obrero")).toBeLessThan(text.indexOf("Segunda"));
  });

  it("muestra solo lo vencido o de hoy", () => {
    expect(pendingText(snapshot())).toContain("Pendientes* (1)");
  });
});
