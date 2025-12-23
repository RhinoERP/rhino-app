import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseReceipt } from "@/components/purchases/purchase-receipt";
import { Button } from "@/components/ui/button";
import { getPurchaseOrderWithItems } from "@/modules/purchases/service/purchases.service";

type PurchaseReceiptPageProps = {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
};

export default async function PurchaseReceiptPage({
  params,
}: PurchaseReceiptPageProps) {
  const { orgSlug, id } = await params;

  try {
    const purchaseOrder = await getPurchaseOrderWithItems(orgSlug, id);

    if (purchaseOrder.status === "CANCELLED") {
      notFound();
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/org/${orgSlug}/compras/${id}`}>
              <Button size="sm" variant="ghost">
                <ArrowLeft className="h-4 w-4" />
                Volver
              </Button>
            </Link>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="font-heading text-3xl">Recepción de Pedido</h1>
          <p className="text-muted-foreground">
            Confirme los productos recibidos y ajuste las cantidades si es
            necesario
          </p>
        </div>

        <PurchaseReceipt orgSlug={orgSlug} purchaseOrder={purchaseOrder} />
      </div>
    );
  } catch (error) {
    console.error("Error fetching purchase order:", error);
    notFound();
  }
}
