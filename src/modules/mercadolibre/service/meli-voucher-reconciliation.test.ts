import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertMeliFiscalIdentity,
  reserveMeliVoucherNumber,
  verifyMeliReservedVoucher,
} from "./meli-voucher-reconciliation";

vi.mock("server-only", () => ({}));

const request = {
  Concepto: 1,
  DocTipo: 96,
  DocNro: 12_345_678,
  CondicionIVAReceptorId: 5,
  CbteFch: 20_261_116,
  PtoVta: 2,
  CbteTipo: 6,
  CbteDesde: 7,
  CbteHasta: 7,
  ImpTotal: 121,
  ImpNeto: 100,
  ImpIVA: 21,
  ImpTrib: 0,
  ImpOpEx: 0,
  ImpTotConc: 0,
  MonId: "PES",
  MonCotiz: 1,
  Iva: [{ Id: 5, BaseImp: 100, Importe: 21 }],
};
const getLastVoucher = vi.fn();
const getVoucherInfo = vi.fn();
const client = { ElectronicBilling: { getLastVoucher, getVoucherInfo } };
const info = () => ({
  ...request,
  Resultado: "A",
  CodAutorizacion: "86462382117559",
  FchVto: "20261125",
  Iva: { AlicIva: request.Iva },
});

describe("Meli exact fiscal reservation reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getLastVoucher.mockResolvedValue(6);
    getVoucherInfo.mockResolvedValue(info());
  });
  it("reserves a specific number before issuance without issuing a document", async () => {
    expect(
      await reserveMeliVoucherNumber(client, { PtoVta: 2, CbteTipo: 6 })
    ).toEqual({ PtoVta: 2, CbteTipo: 6, CbteDesde: 7, CbteHasta: 7 });
    expect(getVoucherInfo).not.toHaveBeenCalled();
  });
  it("recovers only the exact persisted request and its CAE", async () => {
    const result = await verifyMeliReservedVoucher(client, {
      wsfeRequest: request,
    });
    expect(getVoucherInfo).toHaveBeenCalledWith(7, 2, 6);
    expect(result).toMatchObject({
      voucherNumber: 7,
      authorization: { CAE: "86462382117559", CAEFchVto: "20261125" },
    });
    expect(getLastVoucher).not.toHaveBeenCalled();
  });
  it.each([
    { DocNro: 87_654_321 },
    { ImpTotal: 122 },
    { MonCotiz: 2 },
    { CbteDesde: 8 },
    { Iva: { AlicIva: [{ Id: 5, BaseImp: 100, Importe: 22 }] } },
  ])("does not attach a different voucher: %o", async (changed) => {
    getVoucherInfo.mockResolvedValue({ ...info(), ...changed });
    await expect(
      verifyMeliReservedVoucher(client, { wsfeRequest: request })
    ).rejects.toThrow("no coincide");
  });
  it("keeps a missing voucher pending rather than enabling a new emission", async () => {
    getVoucherInfo.mockResolvedValue(null);
    await expect(
      verifyMeliReservedVoucher(client, { wsfeRequest: request })
    ).rejects.toThrow("permanece pendiente");
  });
  it("does not guess a voucher number for legacy uncertain attempts", async () => {
    await expect(
      verifyMeliReservedVoucher(client, {
        wsfeRequest: { PtoVta: 2, CbteTipo: 6 },
      })
    ).rejects.toThrow("manual");
    expect(getVoucherInfo).not.toHaveBeenCalled();
  });
  it("does not reconcile across issuers or ARCA environments", () => {
    expect(() =>
      assertMeliFiscalIdentity(
        { arcaEnvironment: "dev", issuerCuit: "30711833397" },
        { environment: "prod", issuerCuit: "30711833397" }
      )
    ).toThrow("ambiente");
    expect(() =>
      assertMeliFiscalIdentity(
        { arcaEnvironment: "dev", issuerCuit: "30711833397" },
        { environment: "dev", issuerCuit: "other" }
      )
    ).toThrow("emisor");
  });
});
