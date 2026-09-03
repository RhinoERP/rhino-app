import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseMetaWebhook, verifyMetaSignature } from "./meta-webhook";

describe("parseMetaWebhook", () => {
  it("extracts incoming messages and delivery notifications", () => {
    const result = parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "receiver-1" },
                messages: [
                  {
                    id: "wamid.inbound",
                    from: "5491112345678",
                    type: "text",
                    text: { body: "Hola" },
                    timestamp: "1700000000",
                  },
                ],
                statuses: [
                  {
                    id: "wamid.outbound",
                    status: "delivered",
                    timestamp: "1700000010",
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(result.messages).toMatchObject([
      { phoneNumberId: "receiver-1", content: "Hola", messageType: "TEXT" },
    ]);
    expect(result.deliveryStatuses).toMatchObject([
      { externalMessageId: "wamid.outbound", status: "DELIVERED" },
    ]);
  });

  it("validates Meta's sha256 signature without accepting malformed values", () => {
    const body = '{"entry":[]}';
    const signature = `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

    expect(verifyMetaSignature(body, signature, "app-secret")).toBe(true);
    expect(
      verifyMetaSignature(body, "sha256=not-a-signature", "app-secret")
    ).toBe(false);
  });
});
