import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceListInfoCard } from "@/components/price-lists/price-list-info-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPriceListById } from "@/modules/price-lists/service/price-lists.service";
import { PriceListItemsDataTable } from "./data-table";

type PriceListDetailPageProps = {
  params: Promise<{
    orgSlug: string;
    priceListId: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function PriceListDetailPage({
  params,
}: PriceListDetailPageProps) {
  const { orgSlug, priceListId } = await params;
  const priceList = await getPriceListById(orgSlug, priceListId);

  if (!priceList) {
    notFound();
  }

  const createdAt = priceList.created_at
    ? dateFormatter.format(new Date(priceList.created_at))
    : "-";
  const updatedAt =
    priceList.updated_at && priceList.updated_at !== priceList.created_at
      ? dateFormatter.format(new Date(priceList.updated_at))
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${orgSlug}/precios/listas-de-precios`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver a Listas de precios
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="font-heading text-3xl">{priceList.name}</h1>
              <p className="text-muted-foreground">
                {priceList.supplier_name || "Sin proveedor"}
              </p>
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="border-b p-4">
              <CardTitle className="text-base">Productos</CardTitle>
              <CardDescription>
                Gestiona los precios de los productos en esta lista
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <PriceListItemsDataTable
                orgSlug={orgSlug}
                priceListId={priceListId}
              />
            </CardContent>
          </Card>
        </div>

        <div className="w-80 lg:max-w-xs xl:max-w-sm">
          <PriceListInfoCard
            createdAt={createdAt}
            orgSlug={orgSlug}
            priceList={priceList}
            updatedAt={updatedAt}
          />
        </div>
      </div>
    </div>
  );
}
