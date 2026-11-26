import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../db/types";

const query = vi.hoisted(() => ({
  execute: vi.fn(),
  statements: [] as { parts: string[]; values: unknown[] }[],
}));

vi.mock("kysely", async (importOriginal) => {
  const actual = await importOriginal<typeof import("kysely")>();
  return {
    ...actual,
    sql: (parts: TemplateStringsArray, ...values: unknown[]) => {
      query.statements.push({ parts: Array.from(parts), values });
      return { execute: query.execute };
    },
  };
});

import {
  createAndVerifyMeliJournalFoundation,
  createMeliJournalFoundation,
  findMeliJournalFoundation,
  findMeliPaymentReversalFoundation,
  inspectMeliInvoiceFoundation,
  type MeliJournalFoundationInput,
  reverseAndVerifyMeliPaymentFoundation,
  reverseMeliPaymentFoundation,
  reverseVerifiedMeliPaymentFoundation,
  verifyMeliReversalSourceFoundation,
} from "./meli-journal.foundation";

const executor = new Kysely<Database>({
  dialect: new PostgresDialect({ pool: new Pool() }),
});
const input: MeliJournalFoundationInput = {
  orgId: "00000000-0000-4000-8000-000000000001",
  originType: "payment",
  originId: "00000000-0000-4000-8000-000000000002",
  componentKey: "net",
  requestKey: "00000000-0000-4000-8000-000000000003",
  date: "2026-11-23",
  description: "Cobro Meli",
  actorId: "00000000-0000-4000-8000-000000000004",
  currency: "USD",
  exchangeRate: "1325.75",
  lines: [
    {
      accountId: "00000000-0000-4000-8000-000000000005",
      side: "DEBE",
      originalAmount: "1.00",
      pesosAmount: "1325.75",
    },
    {
      accountId: "00000000-0000-4000-8000-000000000006",
      side: "HABER",
      originalAmount: "1.00",
      pesosAmount: "1325.75",
    },
  ],
};

beforeEach(() => {
  query.execute.mockReset();
  query.statements.length = 0;
});
afterAll(async () => await executor.destroy());

describe("Meli journal internal foundation", () => {
  it("verifies the original payload and reversal together", async () => {
    const reversal = {
      orgId: input.orgId,
      originalEntryId: input.originId,
      requestKey: input.requestKey,
      date: input.date,
      description: "Reversión",
      actorId: input.actorId,
    };
    query.execute.mockResolvedValueOnce({
      rows: [{ original_entry_id: input.originId, reversal_entry_id: null }],
    });
    await expect(
      verifyMeliReversalSourceFoundation(
        { original: input, reversal },
        executor
      )
    ).resolves.toEqual({
      originalEntryId: input.originId,
      reversalEntryId: null,
    });
    expect(query.statements[1].parts.join("?")).toContain(
      "accounting.verify_meli_payment_reversal_source"
    );
    expect(query.statements[0].values).toContain(JSON.stringify(input.lines));
    await expect(
      verifyMeliReversalSourceFoundation(
        { original: { ...input, originType: "invoice" }, reversal },
        executor
      )
    ).rejects.toThrow();
    await expect(
      verifyMeliReversalSourceFoundation(
        { original: input, reversal: { ...reversal, orgId: input.originId } },
        executor
      )
    ).rejects.toThrow();
    expect(query.execute).toHaveBeenCalledTimes(1);
    query.execute.mockResolvedValueOnce({
      rows: [{ original_entry_id: input.orgId, reversal_entry_id: null }],
    });
    await expect(
      verifyMeliReversalSourceFoundation(
        { original: input, reversal },
        executor
      )
    ).rejects.toThrow("no coincide");
  });
  it("uses the atomic reversal primitive and validates its receipt", async () => {
    const reversal = {
      orgId: input.orgId,
      originalEntryId: input.originId,
      requestKey: input.requestKey,
      date: input.date,
      description: "Reversión",
      actorId: input.actorId,
    };
    query.execute.mockResolvedValueOnce({
      rows: [{ reversal_entry_id: input.actorId }],
    });
    await expect(
      reverseVerifiedMeliPaymentFoundation(
        { original: input, reversal },
        executor
      )
    ).resolves.toBe(input.actorId);
    expect(query.statements[1].parts.join("?")).toContain(
      "accounting.reverse_verified_meli_payment"
    );
    query.execute.mockResolvedValueOnce({
      rows: [{ reversal_entry_id: input.originId }],
    });
    await expect(
      reverseVerifiedMeliPaymentFoundation(
        { original: input, reversal },
        executor
      )
    ).rejects.toThrow("coincide con su original");
  });
  it("passes the exact monetary strings and lines to the transactional function", async () => {
    query.execute.mockResolvedValue({ rows: [{ id: input.originId }] });
    expect(await createMeliJournalFoundation(input, executor)).toBe(
      input.originId
    );
    const statement = query.statements[0];
    expect(statement.parts.join("?")).toContain(
      "accounting.create_meli_journal_entry"
    );
    expect(statement.values).toEqual([
      input.orgId,
      input.originType,
      input.originId,
      input.componentKey,
      input.requestKey,
      input.date,
      input.description,
      input.actorId,
      input.currency,
      input.exchangeRate,
      JSON.stringify(input.lines),
    ]);
  });

  it("reconstructs the same payload using database numeric and date types for recovery", async () => {
    query.execute.mockResolvedValue({
      rows: [{ journal_entry_id: input.originId, has_reversal: false }],
    });
    expect(await findMeliJournalFoundation(input, executor)).toBe(
      input.originId
    );
    const statement = query.statements[0];
    expect(statement.parts.join("?")).toContain(
      "accounting.find_meli_journal_request"
    );
    expect(statement.parts.join("?")).toContain("::numeric");
    expect(statement.values).toEqual([
      input.orgId,
      input.requestKey,
      input.orgId,
      input.originType,
      input.originId,
      input.componentKey,
      input.date,
      input.description,
      input.actorId,
      input.currency,
      input.exchangeRate,
      JSON.stringify(input.lines),
    ]);
  });

  it("does not interpret an unknown request as a successful publication", async () => {
    query.execute.mockResolvedValue({ rows: [] });
    expect(await findMeliJournalFoundation(input, executor)).toBeUndefined();
    await expect(createMeliJournalFoundation(input, executor)).rejects.toThrow(
      "No se recibió el identificador"
    );
  });

  it("rejects malformed or lossy inputs without querying", async () => {
    for (const invalid of [
      { ...input, exchangeRate: "1.23456" },
      { ...input, date: "2026-02-30" },
      {
        ...input,
        lines: [{ ...input.lines[0], pesosAmount: "1.001" }, input.lines[1]],
      },
    ]) {
      await expect(
        createMeliJournalFoundation(invalid, executor)
      ).rejects.toThrow();
    }
    expect(query.execute).not.toHaveBeenCalled();
  });

  it("propagates database failures for recovery", async () => {
    query.execute.mockRejectedValue(new Error("database unavailable"));
    await expect(findMeliJournalFoundation(input, executor)).rejects.toThrow(
      "database unavailable"
    );
  });

  it("does not recover a reversed or unverifiable journal as an active receipt", async () => {
    for (const hasReversal of [true, null]) {
      query.execute.mockResolvedValueOnce({
        rows: [{ journal_entry_id: input.originId, has_reversal: hasReversal }],
      });
      await expect(findMeliJournalFoundation(input, executor)).rejects.toThrow(
        "reversión"
      );
    }
    const statement = query.statements[0].parts.join("?");
    expect(statement).toContain("original.anulado_por_id IS NOT NULL");
    expect(statement).toContain("reversal.referencia_id = original.id");
    expect(statement).toContain("reversal.org_id = original.org_id");
  });

  it("inspects invoice receipts with database verification and rejects duplicate or foreign records", async () => {
    const invoice = { ...input, originType: "invoice", componentKey: "fiscal" };
    const { requestKey, ...payload } = invoice;
    const row = {
      request_key: requestKey,
      journal_entry_id: input.orgId,
      payload: { ...payload, exchangeRate: 1325.75 },
      has_reversal: false,
    };
    query.execute.mockResolvedValueOnce({ rows: [row] });
    await expect(
      inspectMeliInvoiceFoundation(input.orgId, input.originId, executor)
    ).resolves.toEqual({
      journalEntryId: input.orgId,
      payload: invoice,
    });
    expect(query.statements[0].parts.join("?")).toContain(
      "accounting.find_meli_journal_request"
    );
    query.execute.mockResolvedValueOnce({ rows: [] });
    await expect(
      inspectMeliInvoiceFoundation(input.orgId, input.originId, executor)
    ).resolves.toBeNull();
    query.execute.mockResolvedValueOnce({ rows: [row, row] });
    await expect(
      inspectMeliInvoiceFoundation(input.orgId, input.originId, executor)
    ).rejects.toThrow("múltiples");
    query.execute.mockResolvedValueOnce({
      rows: [{ ...row, payload: { ...row.payload, originId: input.orgId } }],
    });
    await expect(
      inspectMeliInvoiceFoundation(input.orgId, input.originId, executor)
    ).rejects.toThrow("no coincide");
    query.execute.mockResolvedValueOnce({
      rows: [{ ...row, has_reversal: true }],
    });
    await expect(
      inspectMeliInvoiceFoundation(input.orgId, input.originId, executor)
    ).rejects.toThrow("reversión");
  });

  it("verifies the receipt using the original payload after creation", async () => {
    query.execute
      .mockResolvedValueOnce({ rows: [{ id: input.originId }] })
      .mockResolvedValueOnce({
        rows: [{ journal_entry_id: input.originId, has_reversal: false }],
      });
    await expect(
      createAndVerifyMeliJournalFoundation(input, executor)
    ).resolves.toBe(input.originId);
    expect(query.statements).toHaveLength(2);
    expect(query.statements[1].values[1]).toBe(input.requestKey);
    expect(query.statements[1].values.at(-1)).toBe(JSON.stringify(input.lines));
  });

  it("recovers a lost creation response only when the exact request is found", async () => {
    query.execute
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        rows: [{ journal_entry_id: input.originId, has_reversal: false }],
      });
    await expect(
      createAndVerifyMeliJournalFoundation(input, executor)
    ).resolves.toBe(input.originId);
  });

  it("leaves an absent or unverifiable receipt uncertain", async () => {
    query.execute
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      createAndVerifyMeliJournalFoundation(input, executor)
    ).rejects.toThrow("conservá la misma clave y payload");
    query.execute
      .mockResolvedValueOnce({ rows: [{ id: input.originId }] })
      .mockRejectedValueOnce(new Error("recovery unavailable"));
    await expect(
      createAndVerifyMeliJournalFoundation(input, executor)
    ).rejects.toThrow("No se pudo verificar");
  });

  it("rejects a receipt that disagrees with the creation response", async () => {
    query.execute
      .mockResolvedValueOnce({ rows: [{ id: input.originId }] })
      .mockResolvedValueOnce({
        rows: [{ journal_entry_id: input.orgId, has_reversal: false }],
      });
    await expect(
      createAndVerifyMeliJournalFoundation(input, executor)
    ).rejects.toThrow("no coincide");
  });

  it("rejects invalid requests before trying either primitive", async () => {
    await expect(
      createAndVerifyMeliJournalFoundation(
        { ...input, exchangeRate: "1.23456" },
        executor
      )
    ).rejects.toThrow();
    expect(query.execute).not.toHaveBeenCalled();
  });

  it("uses the same immutable payload to create and recover a reversal", async () => {
    const reversal = {
      orgId: input.orgId,
      originalEntryId: input.originId,
      requestKey: input.requestKey,
      date: input.date,
      description: " Reversión ",
      actorId: input.actorId,
    };
    query.execute
      .mockResolvedValueOnce({ rows: [{ id: input.orgId }] })
      .mockResolvedValueOnce({ rows: [{ reversal_entry_id: input.orgId }] });
    expect(await reverseMeliPaymentFoundation(reversal, executor)).toBe(
      input.orgId
    );
    expect(await findMeliPaymentReversalFoundation(reversal, executor)).toBe(
      input.orgId
    );
    expect(query.statements[0].values).toEqual([
      reversal.orgId,
      reversal.originalEntryId,
      reversal.requestKey,
      reversal.date,
      reversal.description,
      reversal.actorId,
    ]);
    expect(query.statements[1].values).toEqual(query.statements[0].values);
  });

  it("does not interpret an absent reversal as confirmation", async () => {
    const reversal = {
      orgId: input.orgId,
      originalEntryId: input.originId,
      requestKey: input.requestKey,
      date: input.date,
      description: "Reversión",
      actorId: input.actorId,
    };
    query.execute.mockResolvedValue({ rows: [] });
    expect(
      await findMeliPaymentReversalFoundation(reversal, executor)
    ).toBeUndefined();
    await expect(
      reverseMeliPaymentFoundation(reversal, executor)
    ).rejects.toThrow("No se recibió el identificador de la reversión");
    query.execute.mockClear();
    await expect(
      findMeliPaymentReversalFoundation(
        { ...reversal, date: "2026-02-30" },
        executor
      )
    ).rejects.toThrow();
    await expect(
      reverseMeliPaymentFoundation({ ...reversal, description: " " }, executor)
    ).rejects.toThrow();
    expect(query.execute).not.toHaveBeenCalled();
  });

  it("recovers a lost reversal response and rejects unverified receipts", async () => {
    const reversal = {
      orgId: input.orgId,
      originalEntryId: input.originId,
      requestKey: input.requestKey,
      date: input.date,
      description: "Reversión",
      actorId: input.actorId,
    };
    query.execute
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ rows: [{ reversal_entry_id: input.orgId }] });
    await expect(
      reverseAndVerifyMeliPaymentFoundation(reversal, executor)
    ).resolves.toBe(input.orgId);
    query.execute
      .mockResolvedValueOnce({ rows: [{ id: input.orgId }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      reverseAndVerifyMeliPaymentFoundation(reversal, executor)
    ).rejects.toThrow("conservá la misma clave y payload");
    query.execute
      .mockResolvedValueOnce({ rows: [{ id: input.orgId }] })
      .mockResolvedValueOnce({ rows: [{ reversal_entry_id: input.originId }] });
    await expect(
      reverseAndVerifyMeliPaymentFoundation(reversal, executor)
    ).rejects.toThrow("no coincide");
  });
});
