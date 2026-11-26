import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MeliFiscalAccountingHistory,
  MeliFiscalAccountingHistoryResult,
} from "./meli-fiscal-accounting-history";

vi.mock(
  "@/modules/mercadolibre/actions/meli-fiscal-accounting-history.action",
  () => ({ listMeliFiscalJournalEntriesAction: vi.fn() })
);
vi.mock(
  "@/modules/mercadolibre/actions/meli-fiscal-preparation.action",
  () => ({
    getMeliFiscalPreparationAction: vi.fn(),
    inspectMeliFiscalDispatchAction: vi.fn(),
    prepareMeliFiscalAction: vi.fn(),
  })
);
vi.mock("@/modules/mercadolibre/actions/meli-period.action", () => ({
  changeMeliPostingPeriodAction: vi.fn(),
}));

describe("Meli fiscal accounting history", () => {
  it("only requests history when the user chooses to consult it", () => {
    const markup = renderToStaticMarkup(
      <MeliFiscalAccountingHistory
        orgId="org-id"
        orgSlug="org"
        origin={{ type: "invoice", saleId: "sale" }}
      />
    );
    expect(markup).toContain("Consultar asientos vinculados");
    expect(markup).toContain("Verificar asiento fiscal Meli");
    expect(markup).toContain("Consultar período fiscal");
    expect(markup).toContain("Preparar fuente fiscal");
    expect(markup).toContain("Consultar envío fiscal");
    expect(markup).not.toContain("No se encontraron asientos");
  });

  it("does not offer invoice inspection on a credit note", () => {
    const markup = renderToStaticMarkup(
      <MeliFiscalAccountingHistory
        orgId="org-id"
        orgSlug="org"
        origin={{ type: "creditNote", saleId: "sale", creditNoteId: "note" }}
      />
    );
    expect(markup).not.toContain("Verificar asiento fiscal Meli");
    expect(markup).toContain("Consultar período fiscal");
  });

  it("distinguishes an empty history from a failed lookup", () => {
    const empty = renderToStaticMarkup(
      <MeliFiscalAccountingHistoryResult result={{ success: true, data: [] }} />
    );
    const failure = renderToStaticMarkup(
      <MeliFiscalAccountingHistoryResult
        result={{ success: false, error: "Servicio caído" }}
      />
    );
    expect(empty).toContain("requieren revisión manual");
    expect(failure).toContain("Servicio caído");
    expect(failure).not.toContain("No se encontraron asientos");
  });

  it("shows original and reversal without claiming the document is accounted for", () => {
    const original = {
      id: "original",
      org_id: "org",
      tipo_evento: "FACTURA_VENTA",
      referencia_id: "sale",
      referencia_tabla: "sales_orders",
      estado: "ACTIVO" as const,
      idempotency_key: "invoice",
      anulado_por_id: "reversal",
      fecha: "2026-11-21",
    };
    const markup = renderToStaticMarkup(
      <MeliFiscalAccountingHistoryResult
        result={{
          success: true,
          data: [
            original,
            {
              ...original,
              id: "reversal",
              tipo_evento: "CONTRA_ASIENTO",
              referencia_id: "original",
              anulado_por_id: null,
            },
          ],
        }}
      />
    );
    expect(markup).toContain("FACTURA_VENTA");
    expect(markup).toContain("Contra-asiento");
    expect(markup).toContain("Asiento original:");
    expect(markup).toContain("no confirma");
  });
});
