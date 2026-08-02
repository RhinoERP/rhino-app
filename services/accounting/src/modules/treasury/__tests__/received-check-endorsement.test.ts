import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppError } from "../../../utils/errors";

const treasuryMocks = vi.hoisted(() => ({
  runIdempotentTreasuryOperationMock: vi.fn(),
  getPayableAccountByIdForUpdateMock: vi.fn(),
  listReceivedChecksByIdsForUpdateMock: vi.fn(),
  listReceivedCheckEndorsementsByCheckIdsMock: vi.fn(),
  listSupplierCreditsForUpdateMock: vi.fn(),
  createPayablePaymentMock: vi.fn(),
  updateSupplierCreditRemainingAmountMock: vi.fn(),
  createSupplierCreditApplicationsMock: vi.fn(),
  createReceivedCheckEndorsementsMock: vi.fn(),
  updateReceivedCheckEstadoMock: vi.fn(),
  updatePayableAccountBalanceMock: vi.fn(),
}));

vi.mock("../../../db/client", () => ({
  db: {},
}));

vi.mock("../../accounts/accounts.queries", () => ({
  resolveAccountFull: vi.fn(),
}));

vi.mock("../../journal/journal.service", () => ({
  callCreateJournalEntry: vi.fn(),
}));

vi.mock("../treasury-idempotency", () => ({
  buildTreasuryJournalKey: vi.fn(),
  runIdempotentTreasuryOperation:
    treasuryMocks.runIdempotentTreasuryOperationMock,
}));

vi.mock("../treasury.queries", () => ({
  applyMovementToBalance: vi.fn(),
  countPendingItemsForAccount: vi.fn(),
  createBankAccount: vi.fn(),
  createCashDepositSlip: vi.fn(),
  createCheckDepositSlip: vi.fn(),
  createIssuedCheck: vi.fn(),
  createMovement: vi.fn(),
  createPayablePayment: treasuryMocks.createPayablePaymentMock,
  createReceivedCheck: vi.fn(),
  createReceivedCheckEndorsements:
    treasuryMocks.createReceivedCheckEndorsementsMock,
  createSupplierCreditApplications:
    treasuryMocks.createSupplierCreditApplicationsMock,
  getBankAccountById: vi.fn(),
  getBankAccountByIdForUpdate: vi.fn(),
  getDepositSlipWithChecks: vi.fn(),
  getIssuedCheckById: vi.fn(),
  getIssuedCheckByIdForUpdate: vi.fn(),
  getMovementById: vi.fn(),
  getPayableAccountByIdForUpdate:
    treasuryMocks.getPayableAccountByIdForUpdateMock,
  getPayablePaymentById: vi.fn(),
  getReceivedCheckById: vi.fn(),
  getReceivedCheckByIdForUpdate: vi.fn(),
  listMovements: vi.fn(),
  listReceivedCheckEndorsementsByCheckIds:
    treasuryMocks.listReceivedCheckEndorsementsByCheckIdsMock,
  listReceivedCheckEndorsementsByPaymentId: vi.fn(),
  listReceivedChecksByIds: vi.fn(),
  listReceivedChecksByIdsForUpdate:
    treasuryMocks.listReceivedChecksByIdsForUpdateMock,
  listSupplierCreditsForUpdate: treasuryMocks.listSupplierCreditsForUpdateMock,
  toggleBankAccountEstado: vi.fn(),
  updateBankAccount: vi.fn(),
  updateIssuedCheckEstado: vi.fn(),
  updatePayableAccountBalance: treasuryMocks.updatePayableAccountBalanceMock,
  updateReceivedCheckEstado: treasuryMocks.updateReceivedCheckEstadoMock,
  updateSupplierCreditRemainingAmount:
    treasuryMocks.updateSupplierCreditRemainingAmountMock,
}));

import { endorseReceivedChecksForPayableService } from "../treasury.service";

describe("endorseReceivedChecksForPayableService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    treasuryMocks.runIdempotentTreasuryOperationMock.mockImplementation(
      async (options) => {
        const executed = await options.execute({} as never, "operation-1");
        return executed.result;
      }
    );
  });

  it("creates a payable payment, consumes supplier credit FIFO, and marks checks as endorsed", async () => {
    treasuryMocks.getPayableAccountByIdForUpdateMock.mockResolvedValue({
      id: "payable-1",
      organization_id: "org-1",
      supplier_id: "supplier-1",
      total_amount: 1500,
      pending_balance: 1500,
      status: "PENDING",
    });
    treasuryMocks.listReceivedChecksByIdsForUpdateMock.mockResolvedValue([
      {
        id: "check-1",
        numero_cheque: "0001",
        importe: "500.0000",
        estado: "EN_CARTERA",
        deposit_slip_id: null,
      },
      {
        id: "check-2",
        numero_cheque: "0002",
        importe: "400.0000",
        estado: "EN_CARTERA",
        deposit_slip_id: null,
      },
    ]);
    treasuryMocks.listReceivedCheckEndorsementsByCheckIdsMock.mockResolvedValue(
      []
    );
    treasuryMocks.listSupplierCreditsForUpdateMock.mockResolvedValue([
      {
        id: "credit-1",
        remaining_amount: 300,
      },
    ]);
    treasuryMocks.createPayablePaymentMock.mockResolvedValue({
      id: "payment-1",
      account_payable_id: "payable-1",
      amount: 900,
    });
    treasuryMocks.updateSupplierCreditRemainingAmountMock.mockResolvedValue({
      id: "credit-1",
      remaining_amount: 100,
    });
    treasuryMocks.createSupplierCreditApplicationsMock.mockResolvedValue(
      undefined
    );
    treasuryMocks.createReceivedCheckEndorsementsMock.mockResolvedValue([]);
    treasuryMocks.updateReceivedCheckEstadoMock
      .mockResolvedValueOnce({
        id: "check-1",
        numero_cheque: "0001",
        importe: "500.0000",
        estado: "ENDOSADO",
      })
      .mockResolvedValueOnce({
        id: "check-2",
        numero_cheque: "0002",
        importe: "400.0000",
        estado: "ENDOSADO",
      });
    treasuryMocks.updatePayableAccountBalanceMock.mockResolvedValue({
      id: "payable-1",
      pending_balance: 400,
      status: "PARTIAL",
    });

    const result = await endorseReceivedChecksForPayableService({
      orgId: "org-1",
      accountPayableId: "payable-1",
      supplierId: "supplier-1",
      receivedCheckIds: ["check-2", "check-1"],
      creditAmount: "200.0000",
      paymentDate: "2026-08-01",
      referenceNumber: "OP-123",
      notes: "Pago con cheques endosados",
      creadoPor: "user-1",
    });

    expect(
      treasuryMocks.runIdempotentTreasuryOperationMock
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: "RECEIVED_CHECK_ENDORSEMENT",
        orgId: "org-1",
      })
    );
    expect(treasuryMocks.createPayablePaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "org-1",
        account_payable_id: "payable-1",
        amount: 900,
        payment_method: "cheque",
      }),
      expect.anything()
    );
    expect(
      treasuryMocks.createSupplierCreditApplicationsMock
    ).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          supplier_credit_id: "credit-1",
          amount: 200,
          payable_payment_id: "payment-1",
        }),
      ],
      expect.anything()
    );
    expect(
      treasuryMocks.createReceivedCheckEndorsementsMock
    ).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          received_check_id: "check-1",
          payable_payment_id: "payment-1",
        }),
        expect.objectContaining({
          received_check_id: "check-2",
          payable_payment_id: "payment-1",
        }),
      ],
      expect.anything()
    );
    expect(result).toEqual({
      paymentId: "payment-1",
      paymentAmount: "900.0000",
      creditApplied: "200.0000",
      newPendingBalance: "400.0000",
      newStatus: "PARTIAL",
      endorsedChecks: [
        {
          id: "check-1",
          numeroCheque: "0001",
          importe: "500.0000",
          estado: "ENDOSADO",
        },
        {
          id: "check-2",
          numeroCheque: "0002",
          importe: "400.0000",
          estado: "ENDOSADO",
        },
      ],
    });
  });

  it("rejects payments whose endorsed checks plus credit exceed the payable pending balance", async () => {
    treasuryMocks.getPayableAccountByIdForUpdateMock.mockResolvedValue({
      id: "payable-1",
      organization_id: "org-1",
      supplier_id: "supplier-1",
      total_amount: 1000,
      pending_balance: 1000,
      status: "PENDING",
    });
    treasuryMocks.listReceivedChecksByIdsForUpdateMock.mockResolvedValue([
      {
        id: "check-1",
        numero_cheque: "0001",
        importe: "800.0000",
        estado: "EN_CARTERA",
        deposit_slip_id: null,
      },
    ]);
    treasuryMocks.listReceivedCheckEndorsementsByCheckIdsMock.mockResolvedValue(
      []
    );
    treasuryMocks.listSupplierCreditsForUpdateMock.mockResolvedValue([
      {
        id: "credit-1",
        remaining_amount: 500,
      },
    ]);

    await expect(
      endorseReceivedChecksForPayableService({
        orgId: "org-1",
        accountPayableId: "payable-1",
        supplierId: "supplier-1",
        receivedCheckIds: ["check-1"],
        creditAmount: "300.0000",
        paymentDate: "2026-08-01",
      })
    ).rejects.toMatchObject<AppError>({
      status: 422,
      message:
        "La suma de cheques y crédito no puede exceder el saldo pendiente",
    });
  });
});
