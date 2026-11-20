import { describe, expect, it } from "vitest";
import {
  buildApprovalWhatsAppMessage,
  buildApprovalWhatsAppUrl,
  canShareApprovalRequest,
  canShareSyncedOfflineQuote,
} from "./whatsapp-approval-share";

const requestId = "00000000-0000-4000-8000-000000000006";

describe("WhatsApp approval notification", () => {
  it("prefills an internal approval link without a recipient or prices", () => {
    const message = buildApprovalWhatsAppMessage({
      customerName: "Cliente Ñandú",
      requestId,
      orgSlug: "lucho-bet",
      origin: "https://rhinos.example",
    });
    expect(message).toContain("Cliente Ñandú");
    expect(message).toContain("ref. 00000000");
    expect(message).toContain("Está pendiente de aprobación");
    expect(message).toContain(
      `https://rhinos.example/org/lucho-bet/solicitudes-venta/aprobacion#cotizacion-${requestId}`
    );
    expect(buildApprovalWhatsAppUrl(message)).toBe(
      `https://wa.me/?text=${encodeURIComponent(message)}`
    );
    expect(buildApprovalWhatsAppUrl(message)).not.toContain("phone=");
  });

  it("only offers the reminder while the request awaits approval", () => {
    expect(canShareApprovalRequest("PENDING_APPROVAL")).toBe(true);
    for (const status of [
      "RETURNED",
      "APPROVED",
      "CANCELLED",
      "queued",
      "syncing",
    ]) {
      expect(canShareApprovalRequest(status)).toBe(false);
    }
  });

  it("does not offer a link for locally queued or unsaved quotes", () => {
    expect(canShareSyncedOfflineQuote({ status: "synced", requestId })).toBe(
      true
    );
    expect(
      canShareSyncedOfflineQuote({ status: "queued", requestId: null })
    ).toBe(false);
    expect(canShareSyncedOfflineQuote({ status: "syncing", requestId })).toBe(
      false
    );
    expect(
      canShareSyncedOfflineQuote({ status: "synced", requestId: null })
    ).toBe(false);
  });
});
