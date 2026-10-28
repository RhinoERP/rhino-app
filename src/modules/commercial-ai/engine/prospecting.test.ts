import { describe, expect, it } from "vitest";
import type { CustomerView, IcpView, OpportunityView } from "../types";
import { DEFAULT_ROUTE_SETTINGS } from "../types";
import {
  filterCandidates,
  parseProspectCsv,
  ruleFitScore,
  templateMessage,
} from "./prospecting";
import { googleMapsRouteUrl, isInPlaces, recommendStops } from "./routes";

const icp: IcpView = {
  id: "icp",
  name: "Pizzerías",
  description: "",
  keywords: ["pizzería", "rotisería"],
  personas: ["Dueño"],
  valueProposition: "Mozzarella con entrega dos veces por semana.",
};

describe("parseProspectCsv", () => {
  it("lee punto y coma con encabezados en español y comillas", () => {
    const rows = parseProspectCsv(
      'Nombre;Rubro;Localidad;Teléfono\n"Pizzería ""La Nona""";pizzería;Resistencia;3624 111111\nAlmacén Sol;almacén;Fontana;'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Pizzería "La Nona"',
      category: "pizzería",
      city: "Resistencia",
      phone: "3624 111111",
    });
    expect(rows[1].phone).toBeNull();
  });
});

describe("filterCandidates", () => {
  it("descarta clientes, repetidos y exclusiones", () => {
    const base = {
      category: null,
      address: null,
      province: null,
      phone: null,
      email: null,
      website: null,
      externalId: null,
      source: "lista" as const,
    };
    const { kept, discarded } = filterCandidates(
      [
        { ...base, name: "Pizzería Uno", city: "Resistencia" },
        { ...base, name: "Pizzería Uno", city: "Resistencia" },
        { ...base, name: "Don Tito", city: "Fontana" },
        { ...base, name: "Carrefour Express", city: "Resistencia" },
        { ...base, name: "Rotisería Nueva", city: "Resistencia" },
      ],
      {
        existingKeys: new Set(),
        existingExternalIds: new Set(),
        customerNames: new Set(["don tito"]),
        exclusions: ["Carrefour"],
      }
    );
    expect(kept.map((k) => k.name)).toEqual([
      "Pizzería Uno",
      "Rotisería Nueva",
    ]);
    expect(discarded.map((d) => d.why)).toEqual([
      "repetido en la búsqueda",
      "ya es cliente",
      "está en la lista de exclusión",
    ]);
  });
});

describe("ruleFitScore y templateMessage", () => {
  it("puntúa más alto a quien coincide con el rubro del perfil", () => {
    const base = {
      address: null,
      city: "Resistencia",
      province: null,
      email: null,
      website: null,
      externalId: null,
      source: "lista" as const,
    };
    const match = ruleFitScore(
      { ...base, name: "Pizzería Napoli", category: null, phone: "1" },
      icp
    );
    const other = ruleFitScore(
      { ...base, name: "Ferretería Sur", category: "ferretería", phone: null },
      icp
    );
    expect(match.score).toBeGreaterThan(other.score);
    expect(other.reasons).toContain("no se ve claro");
  });

  it("arma el mensaje con la propuesta y el pedido de la campaña", () => {
    const message = templateMessage({
      prospectName: "Pizzería Napoli",
      orgName: "JC Distribuidora",
      sellerName: "Sofía",
      campaign: {
        ask: "visita",
        entryStrategy: "catalogo",
        catalogUrl: "https://ejemplo.com/catalogo",
      },
      icp,
    });
    expect(message).toContain("Sofía de JC Distribuidora");
    expect(message).toContain("https://ejemplo.com/catalogo");
    expect(message).toContain("paso esta semana");
  });
});

describe("rutas", () => {
  it("reconoce localidades sin acentos ni mayúsculas", () => {
    expect(isInPlaces("Resistencia", ["resistencia, Chaco, Argentina"])).toBe(
      true
    );
    expect(isInPlaces("Fontana", ["Corrientes"])).toBe(false);
    expect(isInPlaces(null, [])).toBe(true);
  });

  it("prioriza al cliente en riesgo con oportunidad abierta", () => {
    const customer = (id: string, city: string): CustomerView => ({
      id,
      name: `Cliente ${id}`,
      city,
      channel: null,
      sellerId: "s1",
      phone: null,
      email: null,
      creditLimit: null,
      metrics: {
        status: "activo",
        lastDay: null,
        firstDay: null,
        daysSince: 10,
        orderCount: 5,
        monthly: 0,
      },
      overdue: 0,
      pending: 0,
      maxDaysLate: 0,
      topProducts: [],
      recentOrders: [],
    });
    const risky = {
      key: "a:riesgo:p",
      customerId: "a",
      type: "riesgo",
      value: 500_000,
      effectiveStage: "nueva",
      state: {
        stage: "nueva",
        snoozeUntil: null,
        contactedAt: null,
        lastTouchedAt: null,
      },
    } as unknown as OpportunityView;
    const result = recommendStops({
      date: "2026-10-26",
      sellerId: "s1",
      places: ["Resistencia"],
      settings: { ...DEFAULT_ROUTE_SETTINGS, tope: 1 },
      customers: [
        customer("b", "Resistencia"),
        customer("a", "Resistencia"),
        customer("c", "Corrientes"),
      ],
      opportunities: [risky],
      tasks: [],
      prospects: [],
      routes: [],
    });
    expect(result.universe).toBe(2);
    expect(result.selected[0]?.id).toBe("a");
    expect(result.selected[0]?.reason).toContain("En riesgo");
  });

  it("arma el link de Google Maps con partida y paradas", () => {
    const url = googleMapsRouteUrl(
      [
        {
          name: "Uno",
          city: "Resistencia",
          address: "Av. 9 de Julio 100, Resistencia",
        },
        { name: "Dos", city: "Resistencia", address: null },
      ],
      "Depósito, Resistencia"
    );
    expect(url).toContain("origin=Dep%C3%B3sito");
    expect(url).toContain("waypoints=");
  });
});
