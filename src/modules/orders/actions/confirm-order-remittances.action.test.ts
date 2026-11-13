import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Database } from "@/types/supabase";
import type { SavedOrderRemittance } from "../server/order-remittance-documents.service";
import { planRemittanceDocuments } from "../utils/remittance-document-plan";
import {
  type ConfirmOrderRemittancesInput,
  confirmOrderRemittancesAction,
} from "./confirm-order-remittances.action";
import type { PreparedOrderRemittances } from "./prepare-order-remittances.action";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  existing: vi.fn(),
  refs: vi.fn(),
  prepare: vi.fn(),
  saved: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: vi.fn(async () => ({ id: "org" })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ error: null, data: { user: { id: "actor" } } }),
    },
  })),
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createTypedAdminClient: vi.fn(() => ({
    rpc: mocks.rpc,
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: mocks.existing,
        order: mocks.refs,
      };
      return query;
    },
  })),
}));
vi.mock("./prepare-order-remittances.action", () => ({
  prepareOrderRemittancesAction: mocks.prepare,
}));
vi.mock("../server/order-remittance-documents.service", async (original) => {
  const actual =
    await original<
      typeof import("../server/order-remittance-documents.service")
    >();
  return { ...actual, loadSavedRemittances: mocks.saved };
});

const child = "00000000-0000-4000-8000-000000000001";
const item = "00000000-0000-4000-8000-000000000002";
const product = "00000000-0000-4000-8000-000000000003";
const key = "00000000-0000-4000-8000-000000000004";
const plan: PreparedOrderRemittances = {
  automaticNumbering: true,
  parentOrderId: "parent",
  childOrderIds: [child],
  sourceFingerprint: "a".repeat(32),
  carrierName: null,
  header: {
    type: "REMITO_FINAL",
    date: "2026-11-12",
    currency: "ARS",
    taxesTotal: 0,
    issuer: { businessName: "Emisor" },
    customer: { businessName: "Cliente" },
    seller: { name: "Vendedor" },
  },
  documents: planRemittanceDocuments([
    {
      source: {
        id: item,
        orderId: child,
        product_id: product,
        product_variant_id: null,
      },
      item: {
        sku: "CAMISA",
        name: "Camisa",
        quantity: 20,
        unitOfMeasure: "UN",
        unitPrice: 10,
        subtotal: 200,
      },
    },
  ]),
};
const input: ConfirmOrderRemittancesInput = {
  orgSlug: "safe-dc",
  childOrderIds: [child],
  sourceFingerprint: plan.sourceFingerprint,
  idempotencyKey: key,
  automaticNumbering: true,
  documents: [{ number: "", packageCount: null, declaredValue: 140 }],
};

describe("confirmOrderRemittancesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existing.mockResolvedValue({ data: null, error: null });
    mocks.prepare.mockResolvedValue({ success: true, data: plan });
    mocks.rpc.mockResolvedValue({
      error: null,
      data: [
        {
          batch_id: "batch",
          remittance_id: "document",
          document_number: "00046",
          document_position: 1,
        },
      ],
    });
  });

  it("rebuilds the exact original request after a committed response is lost", async () => {
    expect((await confirmOrderRemittancesAction(input)).success).toBe(true);
    const firstArgs: Database["public"]["Functions"]["commit_order_remittance_documents"]["Args"] =
      mocks.rpc.mock.calls[0][1];
    const [payload] = z
      .array(z.object({ header_snapshot: z.json() }))
      .parse(firstArgs.p_documents);
    const saved: SavedOrderRemittance = {
      id: "document",
      organization_id: "org",
      batch_id: "batch",
      document_number: "00046",
      document_position: 1,
      issue_date: "2026-11-12",
      status: "ISSUED",
      package_count: null,
      declared_value: 140,
      subtotal: 200,
      discount_total: 0,
      total: 200,
      currency: "ARS",
      snapshot_version: 1,
      header_snapshot: payload.header_snapshot,
      pdf_url: null,
      created_at: "2026-11-12T15:00:00Z",
      voided_at: null,
      void_reason: null,
      lines: [
        {
          id: "line",
          organization_id: "org",
          remittance_id: "document",
          line_position: 1,
          product_id: product,
          product_variant_id: null,
          sku: "CAMISA",
          product_name: "Camisa",
          brand: null,
          variant_name: null,
          unit_of_measure: "UN",
          quantity: 20,
          weight_quantity: null,
          unit_price: 10,
          subtotal: 200,
          discount_percentage: null,
          extras_snapshot: [],
          sources: [
            {
              id: "source",
              organization_id: "org",
              line_id: "line",
              order_id: child,
              quote_item_id: item,
              quantity: 20,
            },
          ],
        },
      ],
    };
    mocks.existing.mockResolvedValue({
      data: { id: "batch", parent_order_id: "parent", created_by: "actor" },
      error: null,
    });
    mocks.refs.mockResolvedValue({ data: [{ id: "document" }], error: null });
    mocks.saved.mockResolvedValue([saved]);
    expect((await confirmOrderRemittancesAction(input)).success).toBe(true);
    expect(mocks.rpc.mock.calls[1][1]).toEqual(firstArgs);
    expect(mocks.prepare).toHaveBeenCalledTimes(1);
  });

  it("does not commit a stale plan or another user's idempotency key", async () => {
    const changed = await confirmOrderRemittancesAction({
      ...input,
      sourceFingerprint: "b".repeat(32),
    });
    expect(changed.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.existing.mockResolvedValue({
      data: {
        id: "batch",
        parent_order_id: "parent",
        created_by: "other-actor",
      },
      error: null,
    });
    const forbidden = await confirmOrderRemittancesAction(input);
    expect(forbidden.success).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
