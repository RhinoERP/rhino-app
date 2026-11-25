import "server-only";

import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin-client";
import { assertArcaSecretsKey } from "@/modules/arca/server/secrets";

const tokenPattern = /^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/;
const receiptSchema = z.object({
  remittance_id: z.uuid(),
  organization_id: z.uuid(),
  received_at: z.string().nullable(),
  receiver_name: z.string().nullable(),
});

export function receiptTokenHash(token: string) {
  if (!tokenPattern.test(token)) {
    throw new Error("Enlace de recepción inválido.");
  }
  return createHash("sha256").update(token).digest("hex");
}

export async function createRemittanceReceiptLink(document: {
  id: string;
  organization_id: string;
  status: string;
}) {
  if (document.status !== "ISSUED") {
    throw new Error("El remito está anulado.");
  }
  const signature = createHmac("sha256", assertArcaSecretsKey())
    .update(`remittance-receipt:${document.organization_id}:${document.id}`)
    .digest("base64url");
  const token = `${document.id}.${signature}`;
  const db = createAdminClient();
  const result = await db.from("remittance_receipts").upsert(
    {
      remittance_id: document.id,
      organization_id: document.organization_id,
      token_hash: receiptTokenHash(token),
    },
    { onConflict: "remittance_id", ignoreDuplicates: true }
  );
  if (result.error) {
    throw new Error("No se pudo generar el enlace de recepción.");
  }
  const existing = await db
    .from("remittance_receipts")
    .select("token_hash")
    .eq("remittance_id", document.id)
    .eq("organization_id", document.organization_id)
    .single();
  if (
    existing.error ||
    z.object({ token_hash: z.string() }).parse(existing.data).token_hash !==
      receiptTokenHash(token)
  ) {
    throw new Error("El enlace requiere actualización por un administrador.");
  }
  return `/remitos/recepcion/${token}`;
}

export async function getPublicRemittanceReceipt(token: string) {
  const db = createAdminClient();
  const result = await db
    .from("remittance_receipts")
    .select("remittance_id,organization_id,received_at,receiver_name")
    .eq("token_hash", receiptTokenHash(token))
    .maybeSingle();
  if (result.error || !result.data) {
    return null;
  }
  const receipt = receiptSchema.parse(result.data);
  const documentResult = await db
    .from("order_remittances")
    .select("id,document_number,issue_date,status,header_snapshot")
    .eq("id", receipt.remittance_id)
    .eq("organization_id", receipt.organization_id)
    .single();
  if (documentResult.error || !documentResult.data) {
    return null;
  }
  const document = z
    .object({
      id: z.uuid(),
      document_number: z.string(),
      issue_date: z.string(),
      status: z.string(),
      header_snapshot: z.object({
        remittance: z.object({
          fiscal: z.object({ businessName: z.string() }),
          customer: z.object({ businessName: z.string() }),
        }),
      }),
    })
    .parse(documentResult.data);
  return {
    number: document.document_number,
    date: document.issue_date,
    issuer: document.header_snapshot.remittance.fiscal.businessName,
    customer: document.header_snapshot.remittance.customer.businessName,
    cancelled: document.status !== "ISSUED",
    receivedAt: receipt.received_at,
    receiverName: receipt.receiver_name,
  };
}

export async function confirmPublicRemittanceReceipt(
  token: string,
  name: string
) {
  const parsedName = z
    .string()
    .trim()
    .min(2, "Ingresá tu nombre y apellido.")
    .max(200)
    .parse(name);
  const result = await createAdminClient().rpc("confirm_remittance_receipt", {
    p_token_hash: receiptTokenHash(token),
    p_name: parsedName,
  });
  if (result.error) {
    throw new Error(
      "No se pudo registrar la recepción. Verificá que el remito siga vigente."
    );
  }
}
