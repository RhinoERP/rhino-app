import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import type { Database } from "../../db/types";

vi.mock("../../db/client", () => ({ db: null }));

import { buildJournalEntriesByOriginQuery } from "./journal.service";

it("scopes originals and reversal lookup to the same organization", async () => {
  const executor = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new Pool() }),
  });
  try {
    const orgId = "00000000-0000-4000-8000-000000000001";
    const originId = "00000000-0000-4000-8000-000000000002";
    const query = buildJournalEntriesByOriginQuery(
      {
        orgId,
        referenciaId: originId,
        referenciaTabla: "mercadolibre_payments",
      },
      executor
    ).compile();
    expect(query.parameters.filter((value) => value === orgId)).toHaveLength(2);
    expect(query.parameters.filter((value) => value === originId)).toHaveLength(
      2
    );
    expect(query.parameters).toContain("CONTRA_ASIENTO");
    expect(query.parameters).toContain("accounting.journal_entries");
    expect(query.sql).toContain(
      'select "id" from "accounting"."journal_entries"'
    );
    expect(query.sql).toContain('"referencia_id" in (select');
    expect(query.sql).toContain('order by "creado_at" asc, "id" asc');
  } finally {
    await executor.destroy();
  }
});
