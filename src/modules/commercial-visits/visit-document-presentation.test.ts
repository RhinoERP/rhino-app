import { describe, expect, it } from "vitest";
import type { VisitDocumentCandidates } from "./contracts";
import {
  availableVisitDocuments,
  visitDocumentStatusLabel,
} from "./visit-document-presentation";

const visitId = "11111111-1111-4111-8111-111111111111";
const otherVisitId = "22222222-2222-4222-8222-222222222222";
const candidates: VisitDocumentCandidates = {
  quotes: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      status: "APPROVED",
      total: 10,
      createdAt: "2026-11-18T10:00:00Z",
      linkedVisitId: visitId,
      salesOrderId: null,
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      status: "PENDING_APPROVAL",
      total: 20,
      createdAt: "2026-11-18T10:00:00Z",
      linkedVisitId: otherVisitId,
      salesOrderId: null,
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      status: "DRAFT",
      total: 30,
      createdAt: "2026-11-18T10:00:00Z",
      linkedVisitId: null,
      salesOrderId: null,
    },
  ],
  orders: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      status: "CONFIRMED",
      total: 10,
      createdAt: "2026-11-18T10:00:00Z",
      linkedVisitId: visitId,
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      status: "DRAFT",
      total: 20,
      createdAt: "2026-11-18T10:00:00Z",
      linkedVisitId: null,
    },
  ],
};

describe("visit documents in the modal", () => {
  it("translates quote and pre-sale states without changing their stored values", () => {
    expect(visitDocumentStatusLabel("quote", "PENDING_APPROVAL")).toBe(
      "Pendiente de aprobación"
    );
    expect(visitDocumentStatusLabel("quote", "CONVERTED")).toBe(
      "Aprobada · Preventa creada"
    );
    expect(visitDocumentStatusLabel("pre_sale", "DRAFT")).toBe("Borrador");
    expect(visitDocumentStatusLabel("pre_sale", "CONFIRMED")).toBe(
      "Confirmada"
    );
    expect(visitDocumentStatusLabel("pre_sale", "DISPATCH")).toBe("Despachada");
    expect(visitDocumentStatusLabel("pre_sale", "DELIVERED")).toBe("Entregada");
  });

  it("hides linked documents from the seller checklist", () => {
    const available = availableVisitDocuments(candidates, visitId, false);
    expect(available.quotes.map((quote) => quote.status)).toEqual(["DRAFT"]);
    expect(available.orders.map((order) => order.status)).toEqual(["DRAFT"]);
  });

  it("still lets an admin move documents linked to another visit", () => {
    const available = availableVisitDocuments(candidates, visitId, true);
    expect(available.quotes.map((quote) => quote.linkedVisitId)).toEqual([
      otherVisitId,
      null,
    ]);
    expect(available.orders.map((order) => order.linkedVisitId)).toEqual([
      null,
    ]);
  });

  it("shows an empty checklist when every document was already linked", () => {
    expect(
      availableVisitDocuments(
        {
          quotes: candidates.quotes.slice(0, 1),
          orders: candidates.orders.slice(0, 1),
        },
        visitId,
        false
      )
    ).toEqual({ quotes: [], orders: [] });
  });
});
