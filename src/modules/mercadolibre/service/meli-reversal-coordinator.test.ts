import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coordinateMeliPaymentReversal,
  type MeliReversalCoordinatorPorts,
} from "./meli-reversal-coordinator";

vi.mock("server-only", () => ({}));

const id = (number: number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const identity = {
  orgId: id(1),
  paymentId: id(2),
  reservationId: id(3),
  requestKey: id(4),
};
const component = (number: number, key: string) => ({
  key,
  original: {
    orgId: identity.orgId,
    originType: "payment" as const,
    originId: identity.paymentId,
    componentKey: key,
    requestKey: id(10 + number),
    date: "2026-11-23",
    description: "Cobro",
    actorId: id(5),
    currency: "ARS" as const,
    exchangeRate: "1",
    lines: [
      {
        accountId: id(6),
        side: "DEBE" as const,
        originalAmount: "1",
        pesosAmount: "1",
      },
      {
        accountId: id(7),
        side: "HABER" as const,
        originalAmount: "1",
        pesosAmount: "1",
      },
    ],
  },
  originalEntryId: id(20 + number),
  requestKey: id(30 + number),
  confirmedEntryId: null as string | null,
});
const makeReservation = () => ({
  ...identity,
  preparationId: id(8),
  date: "2026-11-23",
  description: "Reversión",
  actorId: id(5),
  status: "RESERVED" as "RESERVED" | "VOIDED",
  components: [component(1, "net"), component(2, "commission")],
});

describe("Meli reversal coordinator", () => {
  let state: ReturnType<typeof makeReservation>;
  let ports: MeliReversalCoordinatorPorts;
  const receipts = new Map<string, string>();

  beforeEach(() => {
    state = makeReservation();
    receipts.clear();
    ports = {
      loadVerifiedReservation: vi.fn(async () => structuredClone(state)),
      assertReconciled: vi.fn(async () => await Promise.resolve()),
      reverse: vi.fn(async ({ reversal }) => {
        const existing = receipts.get(reversal.requestKey);
        const entry =
          existing ?? (reversal.requestKey === id(31) ? id(41) : id(42));
        receipts.set(reversal.requestKey, entry);
        return await Promise.resolve(entry);
      }),
      verify: vi.fn(
        async ({ reversal }) =>
          await Promise.resolve(receipts.get(reversal.requestKey) ?? null)
      ),
      confirm: vi.fn(async (_identity, current, entry) => {
        const found = state.components.find((item) => item.key === current.key);
        if (!found) {
          throw new Error("Missing component");
        }
        found.confirmedEntryId = entry;
        await Promise.resolve();
      }),
      finalize: vi.fn(async () => {
        state.status = "VOIDED";
        await Promise.resolve();
      }),
    };
  });

  it("verifies every receipt, confirms all components and reconciles before finalizing", async () => {
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).resolves.toEqual({
      reservationId: identity.reservationId,
      status: "VOIDED",
    });
    expect(ports.reverse).toHaveBeenCalledTimes(2);
    expect(ports.confirm).toHaveBeenCalledTimes(2);
    expect(ports.verify).toHaveBeenCalledTimes(4);
    expect(ports.assertReconciled).toHaveBeenCalledTimes(2);
    expect(ports.finalize).toHaveBeenCalledOnce();
    expect(ports.reverse).toHaveBeenCalledWith(
      expect.objectContaining({
        reversal: expect.objectContaining({
          requestKey: id(31),
          actorId: id(5),
        }),
      })
    );
    await coordinateMeliPaymentReversal(identity, ports);
    expect(ports.reverse).toHaveBeenCalledTimes(2);
    expect(ports.finalize).toHaveBeenCalledOnce();
  });

  it("resumes a partial reversal after a lost response using the durable key", async () => {
    const reverse = ports.reverse;
    ports.reverse = vi.fn(async (request) => {
      const entry = await reverse(request);
      if (request.reversal.requestKey === id(32)) {
        throw new Error("Respuesta perdida");
      }
      return entry;
    });
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).rejects.toThrow(
      "Respuesta perdida. Consultá el estado y reintentá con la misma reserva y claves"
    );
    expect(state.components[0].confirmedEntryId).toBe(id(41));
    expect(state.components[1].confirmedEntryId).toBeNull();
    expect(ports.finalize).not.toHaveBeenCalled();
    ports.reverse = reverse;
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).resolves.toMatchObject({ status: "VOIDED" });
    expect(receipts.size).toBe(2);
    expect(state.components[1].confirmedEntryId).toBe(id(42));
  });

  it("recovers a lost confirmation without creating another reversal", async () => {
    const confirm = ports.confirm;
    ports.confirm = vi.fn(async (request, current, entry) => {
      await confirm(request, current, entry);
      throw new Error("Confirmación incierta");
    });
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).rejects.toThrow("Confirmación incierta");
    expect(state.components[0].confirmedEntryId).toBe(id(41));
    expect(ports.finalize).not.toHaveBeenCalled();
    ports.confirm = confirm;
    await coordinateMeliPaymentReversal(identity, ports);
    expect(ports.reverse).toHaveBeenCalledTimes(2);
    expect(state.status).toBe("VOIDED");
  });

  it("recovers a lost finalization response without finalizing twice", async () => {
    ports.finalize = vi.fn(async () => {
      state.status = "VOIDED";
      await Promise.reject(new Error("Finalización incierta"));
    });
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).rejects.toThrow("Finalización incierta");
    expect(state.status).toBe("VOIDED");
    await coordinateMeliPaymentReversal(identity, ports);
    expect(ports.finalize).toHaveBeenCalledOnce();
    expect(ports.reverse).toHaveBeenCalledTimes(2);
  });

  it("does not finalize if the second reconciliation fails", async () => {
    ports.assertReconciled = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Cambió la historia"));
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).rejects.toThrow("Cambió la historia");
    expect(ports.confirm).toHaveBeenCalledTimes(2);
    expect(ports.finalize).not.toHaveBeenCalled();
  });

  it("does not finalize on mismatched receipts, reconciliation failure or missing confirmations", async () => {
    ports.verify = vi.fn(async () => await Promise.resolve(id(99)));
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).rejects.toThrow("recibo verificado");
    expect(ports.confirm).not.toHaveBeenCalled();
    expect(ports.finalize).not.toHaveBeenCalled();
    ports.assertReconciled = vi
      .fn()
      .mockRejectedValue(new Error("Historia externa"));
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).rejects.toThrow("Historia externa");
    expect(ports.finalize).not.toHaveBeenCalled();
  });

  it("rejects duplicated original entries or mismatched identities before writing", async () => {
    state.components[1].originalEntryId = state.components[0].originalEntryId;
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).rejects.toThrow("componentes");
    expect(ports.reverse).not.toHaveBeenCalled();
    state = makeReservation();
    state.paymentId = id(99);
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).rejects.toThrow("no coincide");
    expect(ports.reverse).not.toHaveBeenCalled();
  });

  it("rejects changed source data or an unconfirmed finalization", async () => {
    const load = ports.loadVerifiedReservation;
    let calls = 0;
    ports.loadVerifiedReservation = vi.fn(async (input) => {
      const result = await load(input);
      calls += 1;
      if (calls === 2) {
        result.components[0].requestKey = id(99);
      }
      return result;
    });
    await expect(
      coordinateMeliPaymentReversal(identity, ports)
    ).rejects.toThrow("cambió");
    expect(ports.finalize).not.toHaveBeenCalled();
  });
});
