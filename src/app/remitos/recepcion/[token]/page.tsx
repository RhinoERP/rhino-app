import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RemittanceReceiptForm } from "@/components/orders/remittance-receipt-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPublicRemittanceReceipt } from "@/modules/orders/server/remittance-receipt.service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Recepción de remito",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function RemittanceReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const receipt = await getPublicRemittanceReceipt(token).catch(() => null);
  if (!receipt) {
    notFound();
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl items-center p-4 sm:p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Recepción de remito</CardTitle>
          <CardDescription>{receipt.issuer}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="space-y-3 rounded-lg bg-muted/40 p-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Remito R</dt>
              <dd className="font-medium font-mono">{receipt.number}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Destinatario</dt>
              <dd>{receipt.customer}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha de emisión</dt>
              <dd>{receipt.date.split("-").reverse().join("/")}</dd>
            </div>
          </dl>
          {receipt.cancelled && (
            <p>Este remito fue anulado y no admite confirmaciones.</p>
          )}
          {!receipt.cancelled && receipt.receivedAt && (
            <p className="rounded-lg border p-4 text-sm">
              Recepción registrada a nombre de {receipt.receiverName}. La
              confirmación ya quedó guardada.
            </p>
          )}
          {!(receipt.cancelled || receipt.receivedAt) && (
            <RemittanceReceiptForm token={token} />
          )}
        </CardContent>
      </Card>
    </main>
  );
}
