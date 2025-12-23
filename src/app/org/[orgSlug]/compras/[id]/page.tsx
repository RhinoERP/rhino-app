import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PurchaseOrderDetails } from "@/components/purchases/purchase-order-details";
import { Button } from "@/components/ui/button";
import { getPurchaseOrderWithItems } from "@/modules/purchases/service/purchases.service";

type PurchaseOrderPageProps = {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
};

export default async function PurchaseOrderPage({
  params,
}: PurchaseOrderPageProps) {
  const { orgSlug, id } = await params;

  try {
    const purchaseOrder = await getPurchaseOrderWithItems(orgSlug, id);
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/org/${orgSlug}/compras`}>
              <Button size="sm" variant="ghost">
                <ArrowLeft className="h-4 w-4" />
                Volver a Compras
              </Button>
            </Link>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="font-heading text-3xl">
            Detalles de la Compra #
            {purchaseOrder.purchase_number?.toString().padStart(6, "0") ??
              "N/A"}
          </h1>
          <p className="text-muted-foreground">
            Información completa de la orden de compra
          </p>
        </div>

        <PurchaseOrderDetails orgSlug={orgSlug} purchaseOrder={purchaseOrder} />
      </div>
    );
  } catch (error) {
    console.error("Error fetching purchase order:", error);
    notFound();
  }
}
