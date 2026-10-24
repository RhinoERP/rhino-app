import { describe, expect, it } from "vitest";
import type { DbExecutor } from "../treasury.queries";
import { reopenReceivableForRejectedCheck } from "../treasury-receivable-reopen";

type Call = {
  op: string;
  table?: string;
  values?: Record<string, unknown>;
  parameters?: readonly unknown[];
};

function createFakeTrx(rows: Record<string, unknown>) {
  const calls: Call[] = [];

  const trx = {
    selectFrom(table: string) {
      const chain = {
        select: () => chain,
        where: () => chain,
        forUpdate: () => chain,
        executeTakeFirst: () => Promise.resolve(rows[table]),
        execute: () => {
          const value = rows[table];
          if (value === undefined) {
            return Promise.resolve([]);
          }
          return Promise.resolve(Array.isArray(value) ? value : [value]);
        },
      };
      return chain;
    },
    deleteFrom(table: string) {
      const chain = {
        where: () => chain,
        execute: () => {
          calls.push({ op: "delete", table });
          return Promise.resolve([]);
        },
      };
      return chain;
    },
    updateTable(table: string) {
      let values: Record<string, unknown> = {};
      const chain = {
        set: (v: Record<string, unknown>) => {
          values = v;
          return chain;
        },
        where: () => chain,
        execute: () => {
          calls.push({ op: "update", table, values });
          return Promise.resolve([]);
        },
      };
      return chain;
    },
    getExecutor() {
      return {
        transformQuery: (node: unknown) => node,
        compileQuery: (node: { parameters?: readonly unknown[] }) => node,
        executeQuery: (query: { parameters?: readonly unknown[] }) => {
          calls.push({ op: "raw", parameters: query.parameters });
          return Promise.resolve({
            rows: [{ create_contra_entry: "contra-1" }],
            numAffectedRows: 1n,
          });
        },
      };
    },
  };

  return { trx: trx as unknown as DbExecutor, calls };
}

const baseRows = {
  "public.receivable_payments": {
    id: "pay-1",
    account_receivable_id: "acc-1",
    amount: "400.0000",
    currency: "ARS",
    accounting_journal_entry_id: null,
  },
};

describe("reopenReceivableForRejectedCheck", () => {
  it("does nothing without a linked payment", async () => {
    const { trx, calls } = createFakeTrx({});

    await reopenReceivableForRejectedCheck({
      trx,
      orgId: "org",
      receivablePaymentId: null,
      checkId: "check-1",
    });

    expect(calls).toEqual([]);
  });

  it("restores the balance as partially paid", async () => {
    const { trx, calls } = createFakeTrx({
      ...baseRows,
      "public.accounts_receivable": {
        id: "acc-1",
        total_amount: "1000.0000",
        pending_balance: "100.0000",
      },
    });

    const result = await reopenReceivableForRejectedCheck({
      trx,
      orgId: "org",
      receivablePaymentId: "pay-1",
      checkId: "check-1",
    });

    const update = calls.find((c) => c.op === "update");
    expect(update?.values).toMatchObject({
      pending_balance: "500.0000",
      status: "PARTIALLY_PAID",
    });
    expect(calls.filter((c) => c.op === "delete")).toHaveLength(2);
    expect(result).toMatchObject({
      reopened: true,
      accountingReversed: false,
      amount: "400.0000",
      currency: "ARS",
    });
  });

  it("caps the balance at the total and marks it pending", async () => {
    const { trx, calls } = createFakeTrx({
      ...baseRows,
      "public.accounts_receivable": {
        id: "acc-1",
        total_amount: "400.0000",
        pending_balance: "0.0000",
      },
    });

    await reopenReceivableForRejectedCheck({
      trx,
      orgId: "org",
      receivablePaymentId: "pay-1",
      checkId: "check-1",
    });

    expect(calls.find((c) => c.op === "update")?.values).toMatchObject({
      pending_balance: "400.0000",
      status: "PENDING",
    });
  });

  it("contraasienta el COBRO contabilizado antes de reabrir", async () => {
    const { trx, calls } = createFakeTrx({
      ...baseRows,
      "public.accounts_receivable": {
        id: "acc-1",
        total_amount: "1000.0000",
        pending_balance: "0.0000",
      },
      "accounting.journal_entries": { id: "journal-1" },
    });

    const result = await reopenReceivableForRejectedCheck({
      trx,
      orgId: "org",
      receivablePaymentId: "pay-1",
      checkId: "check-1",
    });

    expect(result.accountingReversed).toBe(true);
    expect(calls.some((call) => call.op === "raw")).toBe(true);
  });

  it("blocks rejection when the overpayment credit was already consumed", async () => {
    const { trx, calls } = createFakeTrx({
      ...baseRows,
      "public.accounts_receivable": {
        id: "acc-1",
        total_amount: "1000.0000",
        pending_balance: "0.0000",
      },
      "public.customer_credits": {
        id: "credit-1",
        amount: "100.0000",
        remaining_amount: "0.0000",
      },
    });

    await expect(
      reopenReceivableForRejectedCheck({
        trx,
        orgId: "org",
        receivablePaymentId: "pay-1",
        checkId: "check-1",
      })
    ).rejects.toThrow("ya fue utilizado");
    expect(calls.some((call) => call.op === "update")).toBe(false);
  });
});
