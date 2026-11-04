import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));
vi.mock("@/modules/organizations/utils/with-permission-guard", () => ({
  ensure: vi.fn(),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: vi.fn(async () => ({ id: "org-1" })),
}));
vi.mock("@/modules/collections/service/collections.service", () => ({
  deriveReceivableCreditSupplier: vi.fn(),
}));

const { deletePaymentAction } = await import("./delete-payment.action");
const { updatePaymentAction } = await import("./update-payment.action");

function paymentClient(paymentMethod: string) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "payment-1",
        account_receivable_id: "receivable-1",
        amount: 100,
        payment_method: paymentMethod,
      },
      error: null,
    }),
  };
  const from = vi.fn((table: string) => {
    if (table !== "receivable_payments") {
      throw new Error(`Unexpected query of ${table}`);
    }
    return query;
  });
  createClient.mockResolvedValue({ from });
  return { from };
}

const baseInput = {
  orgSlug: "org",
  paymentId: "payment-1",
  accountId: "receivable-1",
  type: "receivable" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cobros con cheque", () => {
  it.each([
    "cheque",
    "e-cheq",
  ])("impide eliminar un cobro %s antes de modificar la deuda", async (method) => {
    const { from } = paymentClient(method);

    const result = await deletePaymentAction(baseInput);

    expect(result).toMatchObject({ success: false });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it.each([
    "cheque",
    "e-cheq",
  ])("impide editar un cobro %s aunque se solicite otro medio", async (method) => {
    const { from } = paymentClient(method);

    const result = await updatePaymentAction({
      ...baseInput,
      amount: 200,
      paymentMethod: "transferencia",
    });

    expect(result).toMatchObject({ success: false });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it.each([
    "cheque",
    "e-cheq",
  ])("impide convertir un cobro existente a %s sin crear cartera", async (method) => {
    const result = await updatePaymentAction({
      ...baseInput,
      amount: 100,
      paymentMethod: method as "cheque" | "e-cheq",
    });

    expect(result).toMatchObject({ success: false });
    expect(createClient).not.toHaveBeenCalled();
  });
});
