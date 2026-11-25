import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCaiUsageReport } from "./cai.service";

const mocks = vi.hoisted(() => ({ from: vi.fn(), access: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./access", () => ({
  getCurrentUserOrganizationArcaAccess: mocks.access,
}));
vi.mock("@/lib/supabase/admin-client", () => ({
  createAdminClient: () => ({ from: mocks.from }),
}));

const org = "10000000-0000-4000-8000-000000000001";
const fiscal = { cai: "12345678901234", pointOfSale: 9, number: 1 };
function row(index: number, isFiscal = true) {
  return {
    id: `90000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    document_number: `00009-${String(index).padStart(8, "0")}`,
    issue_date: "2026-11-24",
    status: "ISSUED",
    header_snapshot: {
      remittance: isFiscal ? { fiscal: { ...fiscal, number: index } } : {},
    },
  };
}

/** Simulate PostgREST applying its own cap after filtering and ordering. */
function api(rows: ReturnType<typeof row>[], cap = 1000, failPage = -1) {
  const calls: Array<{ cursor: string; limit: number }> = [];
  const filters = { eq: vi.fn(), gte: vi.fn(), lt: vi.fn(), not: vi.fn() };
  mocks.from.mockImplementation(() => {
    let cursor = "";
    let onlyFiscal = false;
    let pageLimit = 1000;
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => {
        filters.eq(...args);
        return query;
      },
      gte: (...args: unknown[]) => {
        filters.gte(...args);
        return query;
      },
      lt: (...args: unknown[]) => {
        filters.lt(...args);
        return query;
      },
      not: (...args: unknown[]) => {
        filters.not(...args);
        onlyFiscal = true;
        return query;
      },
      gt: (_column: string, value: string) => {
        cursor = value;
        return query;
      },
      order: () => query,
      limit: (limit: number) => {
        pageLimit = limit;
        return query;
      },
      // biome-ignore lint/suspicious/noThenProperty: PostgREST queries are awaitable builders, including after limit().
      then: (resolve: (value: unknown) => unknown) => {
        calls.push({ cursor, limit: pageLimit });
        if (calls.length === failPage) {
          return Promise.resolve({
            data: null,
            error: { message: "connection lost" },
          }).then(resolve);
        }
        return Promise.resolve({
          data: rows
            .filter(
              (r) =>
                r.id > cursor &&
                (!onlyFiscal || "fiscal" in r.header_snapshot.remittance)
            )
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, Math.min(pageLimit, cap)),
          error: null,
        }).then(resolve);
      },
    };
    return query;
  });
  return { calls, filters };
}

describe("CAI monthly export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      canManage: true,
      organization: { id: org },
    });
  });

  it("finds fiscal documents after more than 1000 historical documents", async () => {
    const { filters } = api([
      ...Array.from({ length: 1000 }, (_, i) => row(i, false)),
      row(1001),
    ]);
    const report = await getCaiUsageReport("safe", "2026-11");
    expect(report).toHaveLength(1);
    expect(report[0].documentNumber).toBe("00009-00001001");
    expect(filters.not).toHaveBeenCalledWith(
      "header_snapshot->remittance->fiscal",
      "is",
      null
    );
    expect(filters.eq).toHaveBeenCalledWith("organization_id", org);
    expect(filters.gte).toHaveBeenCalledWith("issue_date", "2026-11-01");
    expect(filters.lt).toHaveBeenCalledWith("issue_date", "2026-12-01");
  });

  it.each([
    37, 1000,
  ])("exports every row despite an API cap of %i", async (cap) => {
    const { calls } = api(
      Array.from({ length: 1234 }, (_, i) => row(i + 1)),
      cap
    );
    const report = await getCaiUsageReport("safe", "2026-11");
    expect(report).toHaveLength(1234);
    expect(new Set(report.map((r) => r.documentNumber)).size).toBe(1234);
    expect(calls.length).toBeGreaterThan(2);
    expect(calls[1].cursor).not.toBe("");
  });

  it("keeps the export ordered by document number across pages", async () => {
    api(
      [
        row(1),
        { ...row(2), document_number: "00001-00000001", status: "VOIDED" },
      ],
      1
    );
    expect(
      (await getCaiUsageReport("safe", "2026-11")).map((r) => [
        r.documentNumber,
        r.status,
      ])
    ).toEqual([
      ["00001-00000001", "VOIDED"],
      ["00009-00000001", "ISSUED"],
    ]);
  });

  it("exports exactly 10000 rows without truncation", async () => {
    api(Array.from({ length: 10_000 }, (_, i) => row(i + 1)));
    expect(await getCaiUsageReport("safe", "2026-11")).toHaveLength(10_000);
  });

  it("rejects an oversized period instead of returning the first 10000 rows", async () => {
    api(Array.from({ length: 10_001 }, (_, i) => row(i + 1)));
    await expect(getCaiUsageReport("safe", "2026-11")).rejects.toThrow(
      "10.000"
    );
  });

  it("returns an empty period and handles the December boundary", async () => {
    const { filters } = api([]);
    expect(await getCaiUsageReport("safe", "2026-12")).toEqual([]);
    expect(filters.lt).toHaveBeenCalledWith("issue_date", "2027-01-01");
  });

  it("fails the complete export if a later page cannot be read", async () => {
    api([row(1), row(2)], 1, 2);
    await expect(getCaiUsageReport("safe", "2026-11")).rejects.toThrow(
      "connection lost"
    );
  });

  it("requires administration before querying the report", async () => {
    mocks.access.mockResolvedValue({ canManage: false });
    await expect(getCaiUsageReport("safe", "2026-11")).rejects.toThrow(
      "administrador"
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
