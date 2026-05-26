import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BocetoEditor } from "@/components/orders/design/boceto-editor";
import { Button } from "@/components/ui/button";
import { getOrderDetailAction } from "@/modules/orders/actions/get-order-detail.action";

type BocectoPageProps = {
  params: Promise<{ orgSlug: string; orderId: string }>;
};

export default async function BocectoPage({ params }: BocectoPageProps) {
  const { orgSlug, orderId } = await params;

  const order = await getOrderDetailAction(orgSlug, orderId);
  if (!order) {
    notFound();
  }

  return (
    <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
      <div className="flex items-center gap-4">
        <Button asChild size="icon" variant="ghost">
          <Link href={`/org/${orgSlug}/produccion`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-bold text-2xl">Boceto — {order.order_number}</h1>
          <p className="text-muted-foreground text-sm">
            {order.quotes?.customers?.fantasy_name ||
              order.quotes?.customers?.business_name ||
              "Cliente"}{" "}
            · {order.quotes?.quote_items?.length ?? 0} producto(s)
          </p>
        </div>
      </div>

      <BocetoEditor order={order} orgSlug={orgSlug} />
    </div>
  );
}
