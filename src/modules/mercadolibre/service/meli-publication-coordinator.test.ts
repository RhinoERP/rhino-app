import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coordinateMeliPublication,
  type MeliPublicationCoordinatorPorts,
} from "./meli-publication-coordinator";

vi.mock("server-only", () => ({}));

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const invoice = {
  orgId: id(1),
  originType: "invoice" as const,
  originId: id(2),
  componentKey: "fiscal" as const,
  requestKey: id(3),
  date: "2026-11-23",
  description: "Factura",
  actorId: id(4),
  currency: "ARS" as const,
  exchangeRate: "1",
  lines: [
    {
      accountId: id(5),
      side: "DEBE" as const,
      originalAmount: "1",
      pesosAmount: "1",
    },
    {
      accountId: id(6),
      side: "HABER" as const,
      originalAmount: "1",
      pesosAmount: "1",
    },
  ],
};

describe("Meli publication coordinator", () => {
  let state: {
    payload: Parameters<typeof coordinateMeliPublication>[0];
    status: "UNCERTAIN" | "PUBLISHED";
    journalEntryId: string | null;
  };
  let receipt: string | null;
  let exists: boolean;
  let ports: MeliPublicationCoordinatorPorts;

  beforeEach(() => {
    state = {
      payload: structuredClone(invoice),
      status: "UNCERTAIN",
      journalEntryId: null,
    };
    receipt = null;
    exists = false;
    ports = {
      authorize: vi.fn(async () => await Promise.resolve()),
      assertEligible: vi.fn(async () => await Promise.resolve()),
      begin: vi.fn(async () => {
        exists = true;
        return await Promise.resolve(structuredClone(state));
      }),
      load: vi.fn(async () => (exists ? structuredClone(state) : null)),
      lookup: vi.fn(async () => await Promise.resolve(receipt)),
      publish: vi.fn(async () => {
        receipt = id(7);
        return await Promise.resolve(receipt);
      }),
      confirm: vi.fn(async (_payload, entryId) => {
        state.status = "PUBLISHED";
        state.journalEntryId = entryId;
        await Promise.resolve();
      }),
    };
  });

  it("persists before publishing, verifies the receipt and confirms it", async () => {
    await expect(coordinateMeliPublication(invoice, ports)).resolves.toEqual({
      journalEntryId: id(7),
    });
    expect(vi.mocked(ports.begin)).toHaveBeenCalledBefore(
      vi.mocked(ports.publish)
    );
    expect(vi.mocked(ports.publish)).toHaveBeenCalledBefore(
      vi.mocked(ports.confirm)
    );
    expect(ports.assertEligible).toHaveBeenCalledTimes(2);
    expect(ports.lookup).toHaveBeenCalledTimes(2);
    await coordinateMeliPublication(invoice, ports);
    expect(ports.publish).toHaveBeenCalledOnce();
    expect(ports.confirm).toHaveBeenCalledOnce();
  });

  it("recovers a lost publication response using the original receipt", async () => {
    const publish = ports.publish;
    ports.publish = vi.fn(async (payload) => {
      await publish(payload);
      throw new Error("Respuesta perdida");
    });
    await expect(coordinateMeliPublication(invoice, ports)).rejects.toThrow(
      "misma solicitud y clave"
    );
    expect(ports.confirm).not.toHaveBeenCalled();
    await coordinateMeliPublication(invoice, ports);
    expect(ports.publish).toHaveBeenCalledOnce();
    expect(state.journalEntryId).toBe(id(7));
  });

  it("recovers a lost confirmation without publishing again", async () => {
    const confirm = ports.confirm;
    ports.confirm = vi.fn(async (payload, entryId) => {
      await confirm(payload, entryId);
      throw new Error("Respuesta perdida");
    });
    await expect(coordinateMeliPublication(invoice, ports)).rejects.toThrow(
      "No se confirmó el envío publicado"
    );
    await coordinateMeliPublication(invoice, ports);
    expect(ports.publish).toHaveBeenCalledOnce();
    expect(ports.confirm).toHaveBeenCalledOnce();
  });

  it("does not publish when reservation is uncertain or payload conflicts", async () => {
    ports.begin = vi.fn().mockRejectedValue(new Error("Sin respuesta"));
    await expect(coordinateMeliPublication(invoice, ports)).rejects.toThrow(
      "misma solicitud y clave"
    );
    expect(ports.publish).not.toHaveBeenCalled();
    state.payload.description = "Otro asiento";
    exists = true;
    ports.begin = vi.fn(async () => structuredClone(state));
    await expect(coordinateMeliPublication(invoice, ports)).rejects.toThrow(
      "no coincide"
    );
    expect(ports.publish).not.toHaveBeenCalled();
  });

  it("does not confirm a missing or different receipt", async () => {
    ports.lookup = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(id(8));
    await expect(coordinateMeliPublication(invoice, ports)).rejects.toThrow(
      "recibo verificado"
    );
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it("blocks publication when eligibility changes after reservation", async () => {
    ports.assertEligible = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Historia cambió"));
    await expect(coordinateMeliPublication(invoice, ports)).rejects.toThrow(
      "Historia cambió"
    );
    expect(ports.publish).not.toHaveBeenCalled();
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it("retries an absent lookup with exactly the same payload and key", async () => {
    ports.publish = vi.fn().mockRejectedValueOnce(new Error("En tránsito"));
    await expect(coordinateMeliPublication(invoice, ports)).rejects.toThrow(
      "misma solicitud y clave"
    );
    ports.publish = vi.fn(async () => {
      receipt = id(7);
      return await Promise.resolve(receipt);
    });
    await coordinateMeliPublication(invoice, ports);
    expect(ports.publish).toHaveBeenCalledWith(invoice);
    expect(ports.confirm).toHaveBeenCalledWith(invoice, id(7));
  });

  it("refuses a published state whose receipt differs from accounting", async () => {
    exists = true;
    state.status = "PUBLISHED";
    state.journalEntryId = id(8);
    receipt = id(7);
    await expect(coordinateMeliPublication(invoice, ports)).rejects.toThrow(
      "no coincide"
    );
    expect(ports.publish).not.toHaveBeenCalled();
    expect(ports.confirm).not.toHaveBeenCalled();
  });

  it("does not claim success if confirmation was not persisted", async () => {
    ports.confirm = vi.fn(async () => await Promise.resolve());
    await expect(coordinateMeliPublication(invoice, ports)).rejects.toThrow(
      "No se confirmó el envío"
    );
    expect(state.status).toBe("UNCERTAIN");
  });

  it("supports credit notes and individual payment components", async () => {
    const note = { ...invoice, originType: "creditNote" as const };
    state.payload = note;
    await coordinateMeliPublication(note, ports);
    expect(ports.publish).toHaveBeenCalledWith(note);

    const payment = {
      ...invoice,
      originType: "payment" as const,
      componentKey: "commission",
      requestKey: id(9),
    };
    state = {
      payload: payment,
      status: "UNCERTAIN",
      journalEntryId: null,
    };
    receipt = null;
    exists = false;
    await coordinateMeliPublication(payment, ports);
    expect(ports.publish).toHaveBeenCalledWith(payment);
  });

  it("recovers an existing receipt even when new postings are no longer eligible", async () => {
    exists = true;
    receipt = id(7);
    ports.assertEligible = vi
      .fn()
      .mockRejectedValue(new Error("Período cerrado"));
    await coordinateMeliPublication(invoice, ports);
    expect(ports.assertEligible).not.toHaveBeenCalled();
    expect(ports.publish).not.toHaveBeenCalled();
    expect(ports.confirm).toHaveBeenCalledOnce();
  });

  it("does not look up or change a dispatch without authorization", async () => {
    ports.authorize = vi.fn().mockRejectedValue(new Error("Sin permiso"));
    await expect(coordinateMeliPublication(invoice, ports)).rejects.toThrow(
      "Sin permiso"
    );
    expect(ports.load).not.toHaveBeenCalled();
    expect(ports.begin).not.toHaveBeenCalled();
  });

  it("uses the same key and receipt for concurrent retries with idempotent adapters", async () => {
    const results = await Promise.all([
      coordinateMeliPublication(invoice, ports),
      coordinateMeliPublication(invoice, ports),
    ]);
    expect(results).toEqual([
      { journalEntryId: id(7) },
      { journalEntryId: id(7) },
    ]);
    expect(state.journalEntryId).toBe(id(7));
    for (const [payload] of vi.mocked(ports.publish).mock.calls) {
      expect(payload).toEqual(invoice);
    }
    for (const [payload, entryId] of vi.mocked(ports.confirm).mock.calls) {
      expect(payload.requestKey).toBe(invoice.requestKey);
      expect(entryId).toBe(id(7));
    }
  });

  it("isolates the request from mutations by an adapter", async () => {
    ports.authorize = vi.fn(async (payload) => {
      payload.description = "Modificado";
      payload.lines[0].originalAmount = "99";
      await Promise.resolve();
    });
    await coordinateMeliPublication(invoice, ports);
    expect(ports.begin).toHaveBeenCalledWith(invoice);
    expect(ports.publish).toHaveBeenCalledWith(invoice);
    expect(invoice.lines[0].originalAmount).toBe("1");
  });
});
