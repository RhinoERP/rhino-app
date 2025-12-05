import { ArrowLeft, DollarSign, FileText, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SupplierInfoCard } from "@/components/suppliers/supplier-info-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupplierById } from "@/modules/suppliers/service/suppliers.service";

type SupplierDetailsPageProps = {
  params: Promise<{
    orgSlug: string;
    supplierId: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function SupplierDetailsPage({
  params,
}: SupplierDetailsPageProps) {
  const { orgSlug, supplierId } = await params;
  const supplier = await getSupplierById(orgSlug, supplierId);

  if (!supplier) {
    notFound();
  }

  const createdAt = supplier.created_at
    ? dateFormatter.format(new Date(supplier.created_at))
    : "-";
  const updatedAt =
    supplier.updated_at && supplier.updated_at !== supplier.created_at
      ? dateFormatter.format(new Date(supplier.updated_at))
      : null;
  const mapsLink = supplier.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        supplier.address
      )}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${orgSlug}/proveedores`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver a Proveedores
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="font-bold text-3xl leading-tight">
                {supplier.name}
              </h1>
              <p className="text-muted-foreground">
                {supplier.cuit ? `CUIT ${supplier.cuit}` : "CUIT no informado"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <ShoppingBag className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">Compras</CardTitle>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-2xl">0</p>
                  <CardDescription>Total</CardDescription>
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <DollarSign className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">Monto total</CardTitle>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-2xl">$0</p>
                  <CardDescription>Histórico</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="flex items-center gap-2 border-b p-4">
              <ShoppingBag className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Compras recientes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6" />
              </div>
              <p className="text-sm">
                Este proveedor no tiene compras registradas
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="w-80 lg:max-w-xs xl:max-w-sm">
          <SupplierInfoCard
            createdAt={createdAt}
            mapsLink={mapsLink}
            orgSlug={orgSlug}
            supplier={supplier}
            updatedAt={updatedAt}
          />
        </div>
      </div>
    </div>
  );
}
