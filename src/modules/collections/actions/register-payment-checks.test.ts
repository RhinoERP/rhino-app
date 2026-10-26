import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
const createChequeRecibidoServer = vi.fn();
const createChequeEmitidoServer = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));
vi.mock("@/lib/supabase/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/accounting-client", () => ({
  buildCobro: vi.fn(),
  buildOrdenPago: vi.fn(),
}));
vi.mock("@/lib/accounting-server", () => ({
  confirmAccountingEvent: vi.fn(),
  createChequeEmitidoServer: (...args: unknown[]) =>
    createChequeEmitidoServer(...args),
  createChequeRecibidoServer: (...args: unknown[]) =>
    createChequeRecibidoServer(...args),
  endorseReceivedChecksForPayableServer: vi.fn(),
  previewAccountingEvent: vi.fn(),
}));
vi.mock("@/modules/accounting/service/accounting-integration.service", () => ({
  isAccountingIntegrationEnabled: vi.fn(async () => false),
}));
vi.mock("@/modules/collections/service/collections.service", () => ({
  deriveReceivableCreditSupplier: vi.fn(),
}));
vi.mock("@/modules/commissions/service/commissions-generation.service", () => ({
  generateCommissions: vi.fn(),
}));
vi.mock("@/modules/organizations/service/module-access.service", () => ({
  guardOrganizationPermissionAccess: vi.fn(),
}));
vi.mock("@/modules/organizations/service/org-settings.service", () => ({
  getOrgSettings: vi.fn(async () => ({
    automatic_accounting_enabled: false,
  })),
}));
vi.mock("@/modules/organizations/service/organizations.service", () => ({
  getOrganizationBySlug: vi.fn(async () => ({
    id: "org-1",
    supplier_differentiated_credits: false,
    commissions_enabled: false,
  })),
}));

const { registerPaymentAction } = await import("./register-payment.action");

type QueryResult = { data: unknown; error: { message: string } | null };
type Query = Record<string, unknown> & {
  then: (
    resolve: (value: QueryResult) => unknown,
    reject?: (reason: unknown) => unknown
  ) => Promise<unknown>;
};

function makeQuery(result: unknown): Query {
  const query = {} as Query;
  query.select = () => query;
  query.eq = () => query;
  query.gt = () => query;
  query.order = () => query;
  query.in = () => query;
  query.update = () => query;
  query.insert = () => query;
  query.delete = () => query;
  query.single = () => Promise.resolve({ data: result, error: null });
  query.maybeSingle = () => Promise.resolve({ data: result, error: null });
  // biome-ignore lint/suspicious/noThenProperty: fake Supabase query builders are awaitable.
  Object.defineProperty(query, "then", {
    value: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve({ data: result, error: null }).then(resolve, reject),
  });
  return query;
}

function makeCreditsQuery({
  credits,
  currentBalance,
  updates,
}: {
  credits: Array<{ id: string; remaining_amount: number }>;
  currentBalance: number;
  updates: unknown[];
}) {
  const query = makeQuery(credits);
  query.maybeSingle = () =>
    Promise.resolve({
      data: { remaining_amount: currentBalance },
      error: null,
    });
  query.update = (values: unknown) => {
    updates.push(values);
    return query;
  };
  return query;
}

const receivedCheckData = {
  bancoEmisor: "Banco",
  numeroCheque: "123",
  fechaEmision: "2026-01-01",
  fechaVencimiento: "2026-02-01",
};

const issuedCheckData = {
  cuentaBancariaId: "bank-1",
  numeroCheque: "123",
  fechaEmision: "2026-01-01",
  fechaDebito: "2026-02-01",
  beneficiario: "Proveedor",
};

const receivable = {
  id: "ar-1",
  organization_id: "org-1",
  total_amount: 100,
  pending_balance: 100,
  status: "PENDING",
  customer_id: "customer-1",
  sales_order_id: null,
  currency: "ARS",
};

const payable = {
  id: "ap-1",
  organization_id: "org-1",
  total_amount: 100,
  pending_balance: 100,
  status: "PENDING",
  supplier_id: "supplier-1",
  purchase_order_id: null,
  currency: "ARS",
  exchange_rate: null,
};

const payment = {
  id: "payment-1",
  organization_id: "org-1",
  account_receivable_id: "ar-1",
  amount: 50,
  payment_method: "cheque",
  payment_date: "2026-01-01",
  reference_number: null,
};

describe("validación de moneda para cheques", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rechaza un cheque recibido para una deuda USD", async () => {
    const from = vi.fn(() =>
      makeQuery({
        ...receivable,
        currency: "USD",
      })
    );
    createClient.mockResolvedValue({ from });

    const result = await registerPaymentAction({
      orgSlug: "org",
      accountId: "ar-1",
      amount: 100,
      paymentMethod: "cheque",
      paymentDate: "2026-01-01",
      receivedCheckData,
      type: "receivable",
    });

    expect(result).toMatchObject({
      success: false,
      code: "invalid_payment_method",
    });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("rechaza un cheque emitido para una deuda USD", async () => {
    const from = vi.fn(() =>
      makeQuery({
        ...payable,
        currency: "USD",
      })
    );
    createClient.mockResolvedValue({ from });

    const result = await registerPaymentAction({
      orgSlug: "org",
      accountId: "ap-1",
      amount: 100,
      paymentMethod: "cheque",
      paymentDate: "2026-01-01",
      issuedCheckData,
      type: "payable",
    });

    expect(result).toMatchObject({
      success: false,
      code: "invalid_payment_method",
    });
    expect(from).toHaveBeenCalledTimes(1);
  });
});

describe("rollback de créditos al fallar el cheque", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restaura los créditos del cliente si no se puede registrar el cheque", async () => {
    const creditUpdates: unknown[] = [];
    const creditQuery = makeCreditsQuery({
      credits: [{ id: "credit-1", remaining_amount: 50 }],
      currentBalance: 0,
      updates: creditUpdates,
    });
    const insertPayment = makeQuery(payment);
    const deletePayment = makeQuery({ id: "payment-1" });
    const insertApplications = makeQuery(null);
    const deleteApplications = makeQuery(null);
    const from = vi.fn((table: string) => {
      if (table === "accounts_receivable") {
        return makeQuery(receivable);
      }
      if (table === "customer_credits") {
        return creditQuery;
      }
      if (table === "customer_credit_applications") {
        return {
          insert: () => insertApplications,
          delete: () => deleteApplications,
        };
      }
      if (table === "receivable_payments") {
        return {
          insert: () => insertPayment,
          delete: () => deletePayment,
        };
      }
      throw new Error(`Unexpected query of ${table}`);
    });
    createClient.mockResolvedValue({ from });
    createChequeRecibidoServer.mockRejectedValue(new Error("boom"));

    const result = await registerPaymentAction({
      orgSlug: "org",
      accountId: "ar-1",
      amount: 50,
      creditAmount: 50,
      paymentMethod: "cheque",
      paymentDate: "2026-01-01",
      receivedCheckData,
      type: "receivable",
    });

    expect(result).toMatchObject({
      success: false,
      error: "No se pudo registrar el cheque recibido: boom",
    });
    expect(creditUpdates).toEqual([
      { remaining_amount: 0 },
      { remaining_amount: 50 },
    ]);
  });

  it("no restaura créditos si el pago no pudo eliminarse", async () => {
    const creditUpdates: unknown[] = [];
    const creditQuery = makeCreditsQuery({
      credits: [{ id: "credit-1", remaining_amount: 50 }],
      currentBalance: 0,
      updates: creditUpdates,
    });
    const insertPayment = makeQuery(payment);
    const deletePayment = makeQuery(null);
    const insertApplications = makeQuery(null);
    const from = vi.fn((table: string) => {
      if (table === "accounts_receivable") {
        return makeQuery(receivable);
      }
      if (table === "customer_credits") {
        return creditQuery;
      }
      if (table === "customer_credit_applications") {
        return {
          insert: () => insertApplications,
          delete: () => makeQuery(null),
        };
      }
      if (table === "receivable_payments") {
        return {
          insert: () => insertPayment,
          delete: () => deletePayment,
        };
      }
      throw new Error(`Unexpected query of ${table}`);
    });
    createClient.mockResolvedValue({ from });
    createChequeRecibidoServer.mockRejectedValue(new Error("boom"));

    const result = await registerPaymentAction({
      orgSlug: "org",
      accountId: "ar-1",
      amount: 50,
      creditAmount: 50,
      paymentMethod: "cheque",
      paymentDate: "2026-01-01",
      receivedCheckData,
      type: "receivable",
    });

    expect(result).toMatchObject({ success: false });
    expect((result as { error: string }).error).toContain("revisión manual");
    expect(creditUpdates).toEqual([{ remaining_amount: 0 }]);
  });

  it("restaura los créditos del proveedor si no se puede registrar el cheque", async () => {
    const creditUpdates: unknown[] = [];
    const creditQuery = makeCreditsQuery({
      credits: [{ id: "supplier-credit-1", remaining_amount: 50 }],
      currentBalance: 0,
      updates: creditUpdates,
    });
    const insertPayment = makeQuery({
      ...payment,
      account_receivable_id: null,
      account_payable_id: "ap-1",
    });
    const deletePayment = makeQuery({ id: "payment-1" });
    const from = vi.fn((table: string) => {
      if (table === "accounts_payable") {
        return makeQuery(payable);
      }
      if (table === "supplier_credits") {
        return creditQuery;
      }
      if (table === "payable_payments") {
        return {
          insert: () => insertPayment,
          delete: () => deletePayment,
        };
      }
      throw new Error(`Unexpected query of ${table}`);
    });
    createClient.mockResolvedValue({ from });
    createChequeEmitidoServer.mockRejectedValue(new Error("boom"));

    const result = await registerPaymentAction({
      orgSlug: "org",
      accountId: "ap-1",
      amount: 50,
      creditAmount: 50,
      paymentMethod: "cheque",
      paymentDate: "2026-01-01",
      issuedCheckData,
      type: "payable",
    });

    expect(result).toMatchObject({
      success: false,
      error: "No se pudo registrar el cheque propio: boom",
    });
    expect(creditUpdates).toEqual([
      { remaining_amount: 0 },
      { remaining_amount: 50 },
    ]);
  });
});
