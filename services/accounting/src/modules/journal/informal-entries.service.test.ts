import { beforeEach, describe, expect, it, vi } from "vitest";

const executeTakeFirstMock = vi.fn();
const executeMock = vi.fn();

const entryQuery = {
  selectAll: vi.fn(),
  where: vi.fn(),
  executeTakeFirst: executeTakeFirstMock,
};

const linesQuery = {
  selectAll: vi.fn(),
  where: vi.fn(),
  execute: executeMock,
};

const selectFromMock = vi.fn((table: string) =>
  table === "accounting.informal_entries" ? entryQuery : linesQuery
);

entryQuery.selectAll.mockImplementation(() => entryQuery);
entryQuery.where.mockImplementation(() => entryQuery);
linesQuery.selectAll.mockImplementation(() => linesQuery);
linesQuery.where.mockImplementation(() => linesQuery);

vi.mock("../../db/client", () => ({
  db: {
    selectFrom: selectFromMock,
  },
}));

describe("getInformalEntryById", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    entryQuery.selectAll.mockImplementation(() => entryQuery);
    entryQuery.where.mockImplementation(() => entryQuery);
    linesQuery.selectAll.mockImplementation(() => linesQuery);
    linesQuery.where.mockImplementation(() => linesQuery);
  });

  it("filtra por id y org_id antes de cargar líneas", async () => {
    executeTakeFirstMock.mockResolvedValue({
      id: "entry-1",
      org_id: "org-1",
    });
    executeMock.mockResolvedValue([{ informal_entry_id: "entry-1" }]);

    const { getInformalEntryById } = await import("./informal-entries.service");
    const result = await getInformalEntryById("entry-1", "org-1");

    expect(result).toBeDefined();
    expect(entryQuery.where.mock.calls).toContainEqual(["id", "=", "entry-1"]);
    expect(entryQuery.where.mock.calls).toContainEqual([
      "org_id",
      "=",
      "org-1",
    ]);
    expect(linesQuery.where).toHaveBeenCalledWith(
      "informal_entry_id",
      "=",
      "entry-1"
    );
  });
});
