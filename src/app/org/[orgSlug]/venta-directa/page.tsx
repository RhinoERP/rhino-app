import { PlusIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { DirectSalesTabs } from "@/components/pos-sales/direct-sales-tabs";
import { Button } from "@/components/ui/button";
import { getPosCashControlDataByOrgSlug } from "@/modules/pos/service/pos-sessions.service";
import { getDirectSalesByOrgSlug } from "@/modules/sales/service/direct-sales.service";

type DirectSalesPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function DirectSalesPage({
  params,
}: DirectSalesPageProps) {
  const { orgSlug } = await params;
  const [sales, cashControlData] = await Promise.all([
    getDirectSalesByOrgSlug(orgSlug),
    getPosCashControlDataByOrgSlug(orgSlug),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-2xl">Venta Directa</h1>
          <p className="text-muted-foreground text-sm">
            Registra ventas de mostrador, cobradas en el momento y orientadas a
            consumidor final.
          </p>
        </div>
        <Button asChild className="w-full md:w-auto">
          <Link href={`/org/${orgSlug}/venta-directa/nueva`}>
            <PlusIcon className="mr-2 h-4 w-4" weight="bold" />
            Nueva venta directa
          </Link>
        </Button>
      </div>

      <DirectSalesTabs
        orgSlug={orgSlug}
        sales={sales}
        sessions={cashControlData.sessions}
        terminals={cashControlData.terminals}
      />
    </div>
  );
}
