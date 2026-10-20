import { describe, expect, it } from "vitest";
import type { DbExecutor } from "../treasury.queries";
import { reopenReceivableForRejectedCheck } from "../treasury-receivable-reopen";

type Call = { op: string; table: string; values?: Record<string, unknown> };

function createFakeTrx(rows: Record<string, unknown>) {
  const calls: Call[] = [];

  const trx = {
    selectFrom(table: string) {
      const chain = {
        select: () => chain,
        where: () => chain,
        forUpdate: () => chain,
        executeTakeFirst: () => Promise.resolve(rows[table]),
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
  };

  return { trx: trx as unknown as DbExecutor, calls };
}

const baseRows = {
  "public.receivable_payments": {
    id: "pay-1",
    account_receivable_id: "acc-1",
    amount: "400.0000",
  },
};

describe("reopenReceivableForRejectedCheck", () => {
  it("does nothing without a linked payment", async () => {
    const { trx, calls } = createFakeTrx({});

    await reopenReceivableForRejectedCheck({
      trx,
      orgId: "org",
      receivablePaymentId: null,
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

    await reopenReceivableForRejectedCheck({
      trx,
      orgId: "org",
      receivablePaymentId: "pay-1",
    });

    const update = calls.find((c) => c.op === "update");
    expect(update?.values).toMatchObject({
      pending_balance: "500.0000",
      status: "PARTIALLY_PAID",
    });
    expect(calls.filter((c) => c.op === "delete")).toHaveLength(2);
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
    });

    expect(calls.find((c) => c.op === "update")?.values).toMatchObject({
      pending_balance: "400.0000",
      status: "PENDING",
    });
  });
});
