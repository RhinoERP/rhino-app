import { describe, expect, it } from "vitest";
import {
  decideSiteProposalSchema,
  proposeSiteSchema,
  saveCustomerSiteSchema,
  visitCommandSchema,
  visitDayResultSchema,
} from "./contracts";

const id = "11111111-1111-4111-8111-111111111111";

describe("commercial visit commands", () => {
  it("requires a specific branch when planning a visit", () => {
    expect(
      visitCommandSchema.safeParse({
        action: "addToRoute",
        routeId: id,
        customerId: id,
      }).success
    ).toBe(false);
    expect(
      visitCommandSchema.safeParse({
        action: "addToRoute",
        routeId: id,
        customerId: id,
        siteId: id,
      }).success
    ).toBe(true);
  });

  it("validates a site move proposal and admin coordinates", () => {
    const base = {
      action: "proposeLocation",
      visitId: id,
      method: "pin",
      latitude: -34,
      longitude: -58,
    };
    expect(
      visitCommandSchema.safeParse({
        ...base,
        address: "Nuevo local",
        city: "Rosario",
      }).success
    ).toBe(true);
    expect(
      visitCommandSchema.safeParse({ ...base, address: "Nuevo local" }).success
    ).toBe(false);
    const site = {
      action: "saveSite",
      customerId: id,
      name: "Sucursal",
      address: "Calle 1",
      city: "Rosario",
      active: true,
    };
    expect(
      saveCustomerSiteSchema.safeParse({
        ...site,
        latitude: -34,
        longitude: -58,
      }).success
    ).toBe(true);
    expect(
      saveCustomerSiteSchema.safeParse({
        ...site,
        latitude: -34,
        longitude: null,
      }).success
    ).toBe(false);
  });
  it("requires GPS coordinates and accuracy together, unless manual", () => {
    expect(
      visitCommandSchema.safeParse({
        action: "confirmVisit",
        visitId: id,
        manual: false,
        quoteIds: [],
        orderIds: [],
        noDocuments: true,
      }).success
    ).toBe(false);
    expect(
      visitCommandSchema.safeParse({
        action: "confirmVisit",
        visitId: id,
        manual: false,
        latitude: -34,
        longitude: -58,
        accuracyM: 50,
        quoteIds: [id],
        orderIds: [],
        noDocuments: false,
      }).success
    ).toBe(true);
    expect(
      visitCommandSchema.safeParse({
        action: "confirmVisit",
        visitId: id,
        manual: true,
        quoteIds: [],
        orderIds: [],
        noDocuments: true,
      }).success
    ).toBe(true);
    expect(
      visitCommandSchema.safeParse({
        action: "confirmVisit",
        visitId: id,
        manual: false,
        latitude: 91,
        longitude: -58,
        accuracyM: 50,
        quoteIds: [],
        orderIds: [],
        noDocuments: true,
      }).success
    ).toBe(false);
  });

  it("rejects invalid dates and permits only explicit point decisions", () => {
    expect(
      visitCommandSchema.safeParse({
        action: "add",
        customerId: id,
        day: "2026-99-99",
      }).success
    ).toBe(false);
    expect(
      visitCommandSchema.safeParse({
        action: "decideLocation",
        proposalId: id,
        approved: true,
      }).success
    ).toBe(true);
    expect(
      visitCommandSchema.safeParse({
        action: "decideLocation",
        proposalId: "other",
        approved: true,
      }).success
    ).toBe(false);
    expect(
      visitCommandSchema.safeParse({
        action: "decideLocation",
        proposalId: id,
        approved: false,
      }).success
    ).toBe(false);
  });

  it("requires an explicit commercial choice and valid proposal coordinates", () => {
    expect(
      visitCommandSchema.safeParse({
        action: "confirmVisit",
        visitId: id,
        manual: true,
        quoteIds: [id, id],
        orderIds: [],
        noDocuments: false,
      }).success
    ).toBe(false);
    expect(
      visitCommandSchema.safeParse({
        action: "confirmVisit",
        visitId: id,
        manual: true,
        quoteIds: [],
        orderIds: [],
        noDocuments: false,
      }).success
    ).toBe(false);
    expect(
      visitCommandSchema.safeParse({
        action: "proposeLocation",
        visitId: id,
        method: "pin",
        latitude: -34,
        longitude: -58,
        accuracyM: 5,
      }).success
    ).toBe(false);
    expect(
      visitCommandSchema.safeParse({
        action: "linkDocument",
        visitId: id,
        documentType: "quote",
        documentId: id,
      }).success
    ).toBe(true);
  });

  it("validates responses before exposing visit data to the UI", () => {
    expect(
      visitDayResultSchema.safeParse({ visits: [], customers: [] }).success
    ).toBe(true);
    expect(
      visitDayResultSchema.safeParse({
        visits: [{ id, customerName: "Cliente" }],
        customers: [],
      }).success
    ).toBe(false);
  });

  it("requires a real point and an explicit decision for customer-site proposals", () => {
    const proposal = {
      action: "proposeSite",
      customerId: id,
      name: "Sucursal",
      address: "Calle 123",
      city: "Rosario",
      postalCode: "2000",
      latitude: -32.95,
      longitude: -60.66,
    };
    expect(proposeSiteSchema.safeParse(proposal).success).toBe(true);
    expect(
      proposeSiteSchema.safeParse({ ...proposal, latitude: null }).success
    ).toBe(false);
    expect(
      decideSiteProposalSchema.safeParse({
        action: "decideSiteProposal",
        proposalId: id,
        approved: false,
      }).success
    ).toBe(false);
    expect(
      decideSiteProposalSchema.safeParse({
        action: "decideSiteProposal",
        proposalId: id,
        approved: true,
      }).success
    ).toBe(true);
  });
});
