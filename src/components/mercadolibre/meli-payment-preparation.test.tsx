import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MeliPaymentPreparation,
  MeliReversalInspection,
} from "./meli-payment-preparation";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock(
  "@/modules/mercadolibre/actions/meli-payment-preparations.action",
  () => ({
    prepareMeliPaymentAction: vi.fn(),
    getMeliPreparationActorAction: vi.fn(),
    cancelMeliPaymentPreparationAction: vi.fn(),
    inspectMeliPaymentDispatchAction: vi.fn(),
    inspectMeliPaymentReversalsAction: vi.fn(),
  })
);

const active = {
  id: "00000000-0000-4000-8000-000000000001",
  draft_id: "00000000-0000-4000-8000-000000000002",
  status: "PREPARED" as const,
  created_by: "00000000-0000-4000-8000-000000000003",
  created_at: "2026-11-23T12:00:00Z",
  cancelled_by: null,
  cancelled_at: null,
  components: [
    {
      key: "net",
      description: "Neto",
      amount: "80",
      dispatchStatus: null,
      journalEntryId: null,
    },
  ],
};

describe("Meli payment preparation controls", () => {
  it("allows safe cleanup with the feature disabled", () => {
    const markup = renderToStaticMarkup(
      <MeliPaymentPreparation
        enabled={false}
        orgSlug="org"
        paymentId="payment"
        preparations={[active]}
      />
    );
    expect(markup).toContain("Cancelar preparación sin envíos");
    expect(markup).toContain(' disabled=""');
    expect(markup).toContain("bloquea cambios");
  });

  it("does not offer cancellation for an uncertain or published dispatch", () => {
    for (const status of ["UNCERTAIN", "PUBLISHED"] as const) {
      const preparation = {
        ...active,
        components: [
          {
            ...active.components[0],
            dispatchStatus: status,
            journalEntryId: status === "PUBLISHED" ? active.id : null,
          },
        ],
      };
      const markup = renderToStaticMarkup(
        <MeliPaymentPreparation
          enabled={false}
          orgSlug="org"
          paymentId="payment"
          preparations={[preparation]}
        />
      );
      expect(markup).toContain(' disabled=""');
      expect(markup).toContain("requiere recuperación o reversión");
      expect(markup).toContain("Verificar envío");
      expect(markup).toContain("Consultar reversión");
    }
  });

  it("only offers preparation for an enabled active draft", () => {
    const withoutDraft = renderToStaticMarkup(
      <MeliPaymentPreparation
        enabled
        orgSlug="org"
        paymentId="payment"
        preparations={[]}
      />
    );
    expect(withoutDraft).toBe("");
    const markup = renderToStaticMarkup(
      <MeliPaymentPreparation
        draftId={active.draft_id}
        enabled
        orgSlug="org"
        paymentId="payment"
        preparations={[]}
      />
    );
    expect(markup).toContain("Preparar conceptos sin publicar");
  });

  it("distinguishes confirmed, found and missing reversal receipts", () => {
    const markup = renderToStaticMarkup(
      <MeliReversalInspection
        reversals={{
          date: "2026-11-23",
          status: "RESERVED",
          historyIssues: ["Existe un asiento externo."],
          components: [
            {
              key: "net",
              description: "Neto",
              reversalEntryId: "a",
              confirmed: true,
            },
            {
              key: "shipping",
              description: "Envío",
              reversalEntryId: "b",
              confirmed: false,
            },
            {
              key: "commission",
              description: "Comisión",
              reversalEntryId: null,
              confirmed: false,
            },
          ],
        }}
      />
    );
    expect(markup).toContain("contra-asiento a confirmado");
    expect(markup).toContain("contra-asiento b encontrado sin confirmar");
    expect(markup).toContain("sin recibo encontrado; puede seguir en curso");
    expect(markup).toContain("la anulación comercial no está finalizada");
    expect(markup).toContain("Existe un asiento externo.");
    expect(markup).toContain("solicitudes en tránsito");
  });

  it("displays completed commercial void separately", () => {
    const markup = renderToStaticMarkup(
      <MeliReversalInspection
        reversals={{
          date: "2026-11-23",
          status: "VOIDED",
          historyIssues: [],
          components: [
            {
              key: "net",
              description: "Neto",
              reversalEntryId: "a",
              confirmed: true,
            },
          ],
        }}
      />
    );
    expect(markup).toContain("Anulación comercial finalizada");
    expect(markup).toContain("contra-asiento a confirmado");
  });
});
