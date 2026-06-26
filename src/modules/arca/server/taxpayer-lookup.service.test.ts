import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArcaNotConfiguredError } from "../errors";
import {
  getArcaClientForOrganization,
  getCentralArcaPadronClient,
} from "./client-factory";
import { lookupCustomerTaxpayerByCuit } from "./taxpayer-lookup.service";

vi.mock("server-only", () => ({}));

vi.mock("./client-factory", () => ({
  getArcaClientForOrganization: vi.fn(),
  getCentralArcaPadronClient: vi.fn(),
}));

const VALID_CUIT = "30708412623";

const getArcaClientForOrganizationMock = vi.mocked(
  getArcaClientForOrganization
);
const getCentralArcaPadronClientMock = vi.mocked(getCentralArcaPadronClient);

function createPadronClientMock() {
  return {
    RegisterInscriptionProof: {
      getTaxpayerDetails: vi.fn(),
    },
  };
}

describe("lookupCustomerTaxpayerByCuit", () => {
  beforeEach(() => {
    getArcaClientForOrganizationMock.mockReset();
    getCentralArcaPadronClientMock.mockReset();
  });

  it("consulta padrón con el cliente central de producción y no con credenciales de la organización", async () => {
    const padronClient = createPadronClientMock();

    padronClient.RegisterInscriptionProof.getTaxpayerDetails.mockResolvedValue({
      datosGenerales: {
        razonSocial: "ACME SA",
        domicilioFiscal: {
          direccion: "Av Siempre Viva 742",
          localidad: "Rosario",
          descripcionProvincia: "Santa Fe",
        },
      },
      datosRegimenGeneral: {
        impuestos: [{ descripcionImpuesto: "IVA" }],
      },
    });
    getCentralArcaPadronClientMock.mockResolvedValue(padronClient as never);

    await expect(
      lookupCustomerTaxpayerByCuit("empresa-demo", VALID_CUIT)
    ).resolves.toEqual({
      cuit: VALID_CUIT,
      found: true,
      businessName: "ACME SA",
      fiscalAddress: "Av Siempre Viva 742",
      city: "Rosario",
      province: "Santa Fe",
      taxCondition: "RESPONSABLE_INSCRIPTO",
    });

    expect(getCentralArcaPadronClientMock).toHaveBeenCalledTimes(1);
    expect(getArcaClientForOrganizationMock).not.toHaveBeenCalled();
    expect(
      padronClient.RegisterInscriptionProof.getTaxpayerDetails
    ).toHaveBeenCalledWith(Number(VALID_CUIT));
  });

  it("normaliza monotributo y datos de persona humana", async () => {
    const padronClient = createPadronClientMock();

    padronClient.RegisterInscriptionProof.getTaxpayerDetails.mockResolvedValue({
      datosGenerales: {
        apellido: "Pérez",
        nombre: "Juan",
        domicilioFiscal: {
          direccion: "San Martín 123",
          descripcionLocalidad: "Córdoba",
          descripcionProvincia: "Córdoba",
        },
      },
      datosMonotributo: {
        categoriaMonotributo: "A",
      },
    });
    getCentralArcaPadronClientMock.mockResolvedValue(padronClient as never);

    await expect(
      lookupCustomerTaxpayerByCuit("empresa-demo", VALID_CUIT)
    ).resolves.toMatchObject({
      businessName: "Pérez Juan",
      fiscalAddress: "San Martín 123",
      city: "Córdoba",
      province: "Córdoba",
      taxCondition: "MONOTRIBUTO",
    });
  });

  it("devuelve mensaje central cuando Rhino no tiene autorizado padrón", async () => {
    const padronClient = createPadronClientMock();

    padronClient.RegisterInscriptionProof.getTaxpayerDetails.mockRejectedValue(
      new Error("Debe autorizar el uso de ws_sr_constancia_inscripcion")
    );
    getCentralArcaPadronClientMock.mockResolvedValue(padronClient as never);

    await expect(
      lookupCustomerTaxpayerByCuit("empresa-demo", VALID_CUIT)
    ).rejects.toThrow(
      "CUIT válido. No se pudo autocompletar porque Rhino no tiene autorizado el servicio de padrón ARCA."
    );
  });

  it("devuelve error de configuración central cuando falta el operador de Rhino", async () => {
    getCentralArcaPadronClientMock.mockRejectedValue(
      new ArcaNotConfiguredError(
        "El padrón ARCA central de Rhino no está configurado."
      )
    );

    await expect(
      lookupCustomerTaxpayerByCuit("empresa-demo", VALID_CUIT)
    ).rejects.toThrow("El padrón ARCA central de Rhino no está configurado.");
  });
});
