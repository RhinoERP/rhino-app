import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCustomerById } from "@/modules/customers/service/customers.service";

import { CustomerDetailsForm } from "../../../../../components/clientes/customer-details-form";

type CustomerDetailsPageProps = {
  params: Promise<{
    orgSlug: string;
    customerId: string;
  }>;
};

export default async function CustomerDetailsPage({
  params,
}: CustomerDetailsPageProps) {
  const { orgSlug, customerId } = await params;

  const customer = await getCustomerById(customerId);

  if (!customer) {
    notFound();
  }

  const displayName = customer.fantasy_name || customer.business_name;

  return (
    <div className="flex h-full">
      {/* Main Content Area - Left Side */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-6 p-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Link href={`/org/${orgSlug}/clientes`}>
              <Button size="sm" variant="ghost">
                <svg
                  aria-label="Volver"
                  className="h-4 w-4"
                  fill="none"
                  role="img"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M15 18l-6-6 6-6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                </svg>
                Volver a Clientes
              </Button>
            </Link>
          </div>

          {/* Customer Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-bold text-2xl">{displayName}</h1>
              <p className="text-muted-foreground">{customer.business_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={customer.is_active ? "default" : "secondary"}>
                {customer.is_active ? "Activo" : "Inactivo"}
              </Badge>
            </div>
          </div>

          {/* Sales and Orders Section */}
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-blue-100 p-2">
                    <svg
                      aria-label="Icono de pedidos"
                      className="h-4 w-4 text-blue-600"
                      fill="none"
                      role="img"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold">Pedidos</h3>
                </div>
                <div className="text-right">
                  <p className="font-bold text-2xl">0</p>
                  <p className="text-muted-foreground text-sm">Total</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-card p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-green-100 p-2">
                    <svg
                      aria-label="Icono de monto"
                      className="h-4 w-4 text-green-600"
                      fill="none"
                      role="img"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold">Monto Total</h3>
                </div>
                <div className="text-right">
                  <p className="font-bold text-2xl">$0</p>
                  <p className="text-muted-foreground text-sm">Histórico</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Orders Section */}
          <div className="rounded-lg border bg-card">
            <div className="border-b p-4">
              <div className="flex items-center gap-2">
                <svg
                  aria-label="Icono de ventas"
                  className="h-5 w-5 text-muted-foreground"
                  fill="none"
                  role="img"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M9 5H7a2 2 0 00-2 2v8a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                </svg>
                <h3 className="font-semibold">Ventas Recientes</h3>
              </div>
            </div>
            <div className="p-8 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted p-3">
                <svg
                  aria-label="Icono de documento"
                  className="h-6 w-6 text-muted-foreground"
                  fill="none"
                  role="img"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                  />
                </svg>
              </div>
              <p className="text-muted-foreground">
                Este cliente no tiene ventas registradas
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Customer Details Sidebar - Right Side */}
      <div className="w-80 border-l bg-muted/30">
        <div className="sticky top-0 h-full overflow-auto">
          <div className="border-b p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Información del Cliente</h3>
              <CustomerDetailsForm customer={customer} />
            </div>
          </div>

          <div className="space-y-6 p-4">
            {/* Basic Information */}
            <div className="space-y-3">
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Número de Cliente
                </span>
                <p className="mt-1 text-sm">{customer.client_number || "—"}</p>
              </div>

              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  CUIT
                </span>
                <p className="mt-1 text-sm">{customer.cuit || "—"}</p>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Contacto</h4>

              {customer.phone && (
                <div className="flex items-center gap-2">
                  <svg
                    aria-label="Icono de teléfono"
                    className="h-4 w-4 text-muted-foreground"
                    fill="none"
                    role="img"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  </svg>
                  <a
                    className="text-blue-600 text-sm hover:text-blue-800"
                    href={`tel:${customer.phone}`}
                  >
                    {customer.phone}
                  </a>
                </div>
              )}

              {customer.email && (
                <div className="flex items-center gap-2">
                  <svg
                    aria-label="Icono de email"
                    className="h-4 w-4 text-muted-foreground"
                    fill="none"
                    role="img"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  </svg>
                  <a
                    className="text-blue-600 text-sm hover:text-blue-800"
                    href={`mailto:${customer.email}`}
                  >
                    {customer.email}
                  </a>
                </div>
              )}
            </div>

            {/* Address Information */}
            {(customer.address || customer.city) && (
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Dirección</h4>
                <div className="flex items-start gap-2">
                  <svg
                    aria-label="Icono de ubicación"
                    className="mt-0.5 h-4 w-4 text-muted-foreground"
                    fill="none"
                    role="img"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                    <path
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                    />
                  </svg>
                  <div className="text-sm">
                    {customer.address && <div>{customer.address}</div>}
                    {customer.city && (
                      <div className="text-muted-foreground">
                        {customer.city}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="space-y-3 border-t pt-4">
              <div>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Cliente desde
                </span>
                <p className="mt-1 text-sm">
                  {customer.created_at
                    ? new Date(customer.created_at).toLocaleDateString(
                        "es-AR",
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }
                      )
                    : "—"}
                </p>
              </div>

              {customer.updated_at &&
                customer.updated_at !== customer.created_at && (
                  <div>
                    <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                      Última modificación
                    </span>
                    <p className="mt-1 text-sm">
                      {new Date(customer.updated_at).toLocaleDateString(
                        "es-AR",
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }
                      )}
                    </p>
                  </div>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
