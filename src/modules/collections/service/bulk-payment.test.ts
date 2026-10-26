import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const getOrganizationBySlug = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: (...args: unknown[]) => getOrganizationBySlug(...args),
}));

const { processBulkPayment } = await import("./collections.service");

describe("cobranzas masivas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    "cheque",
    "e-cheq",
    "cheque_endosado",
  ])("rechaza el medio de pago %s sin consultar la organización", async (paymentMethod) => {
    const result = await processBulkPayment({
      orgSlug: "org",
      customerId: "customer-1",
      totalAmount: 100,
      paymentMethod: paymentMethod as "cheque",
      paymentDate: "2026-01-01",
    });

    expect(result).toMatchObject({
      success: false,
      code: "invalid_payment_method",
    });
    expect(getOrganizationBySlug).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });
});
