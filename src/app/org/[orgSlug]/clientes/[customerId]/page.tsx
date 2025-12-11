import { ArrowLeft, DollarSign, FileText, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CustomerInfoCard } from "@/components/customers/customer-info-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCustomerById } from "@/modules/customers/service/customers.service";

type CustomerDetailsPageProps = {
  params: Promise<{
    orgSlug: string;
    customerId: string;
  }>;
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function CustomerDetailsPage({
  params,
}: CustomerDetailsPageProps) {
  const { orgSlug, customerId } = await params;

  const customer = await getCustomerById(customerId);

  if (!customer) {
    notFound();
  }

  const displayName = customer.fantasy_name || customer.business_name;
  const createdAt = customer.created_at
    ? dateFormatter.format(new Date(customer.created_at))
    : "-";
  const updatedAt =
    customer.updated_at && customer.updated_at !== customer.created_at
      ? dateFormatter.format(new Date(customer.updated_at))
      : null;

  const mapsLink = customer.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        customer.address + (customer.city ? `, ${customer.city}` : "")
      )}`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${orgSlug}/clientes`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver a Clientes
          </Button>
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h1 className="font-heading text-3xl">{displayName}</h1>
              <p className="text-muted-foreground">
                {customer.cuit ? `CUIT ${customer.cuit}` : "CUIT no informado"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <ShoppingCart className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-base">Pedidos</CardTitle>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-2xl">0</p>
                  <CardDescription>Total</CardDescription>
                </div>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
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
              <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Ventas recientes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <FileText className="h-6 w-6" />
              </div>
              <p className="text-sm">
                Este cliente no tiene ventas registradas
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="w-80 lg:max-w-xs xl:max-w-sm">
          <CustomerInfoCard
            createdAt={createdAt}
            customer={customer}
            mapsLink={mapsLink}
            orgSlug={orgSlug}
            updatedAt={updatedAt}
          />
        </div>
      </div>
    </div>
  );
}
