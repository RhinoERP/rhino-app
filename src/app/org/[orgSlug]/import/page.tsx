import {
  Barcode,
  ChartLineUp,
  Package,
  ShoppingCart,
  Truck,
  UserCircle,
  Van,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { ImportDataClient } from "@/components/import/import-data-client";
import { getAllCarriersByOrgSlug } from "@/modules/carriers/service/carriers.service";
import { getCategoriesByOrgSlug } from "@/modules/categories/service/categories.service";
import type { Category } from "@/modules/categories/types";
import { getCustomersByOrgSlug } from "@/modules/customers/service/customers.service";
import { getOrganizationMembersBySlug } from "@/modules/organizations/service/members.service";
import { getSuppliersByOrgSlug } from "@/modules/suppliers/service/suppliers.service";

export const metadata: Metadata = {
  title: "Importar Datos",
  description: "Descarga plantillas e importa datos masivamente",
};

type ImportPageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function ImportPage({ params }: ImportPageProps) {
  // Extract orgSlug for future use (permissions, logging, etc.)
  const { orgSlug } = await params;
  const [categories, customers, suppliers, carriers, members] =
    await Promise.all([
      getCategoriesByOrgSlug(orgSlug),
      getCustomersByOrgSlug(orgSlug),
      getSuppliersByOrgSlug(orgSlug),
      getAllCarriersByOrgSlug(orgSlug),
      getOrganizationMembersBySlug(orgSlug),
    ]);

  const categoryLabels = formatCategoryLabels(categories);
  const customerLabels = customers
    .map((customer) => customer.fantasy_name || customer.business_name)
    .filter((customer) => Boolean(customer?.trim()))
    .map((customer) => customer.trim());
  const supplierLabels = suppliers
    .map((supplier) => supplier.name)
    .filter((supplier) => Boolean(supplier?.trim()))
    .map((supplier) => supplier.trim());

  const carrierLabels = carriers
    .map((carrier) => carrier.name)
    .filter((carrier) => Boolean(carrier?.trim()))
    .map((carrier) => carrier.trim());

  const sellerLabels = members
    .map((m) => m.user?.name)
    .filter((name): name is string => Boolean(name?.trim()))
    .map((name) => name.trim());

  const templates = [
    {
      id: "products",
      title: "Productos",
      description:
        "Importa tu catálogo de productos con SKU, precios y stock mínimo",
      icon: <Package className="h-6 w-6" weight="duotone" />,
    },
    {
      id: "stock",
      title: "Stock",
      description:
        "Actualiza el inventario por lote con fechas de vencimiento y cantidades",
      icon: <Barcode className="h-6 w-6" weight="duotone" />,
    },
    {
      id: "customers",
      title: "Clientes",
      description:
        "Carga clientes con datos fiscales, contacto y condición tributaria",
      icon: <UserCircle className="h-6 w-6" weight="duotone" />,
    },
    {
      id: "suppliers",
      title: "Proveedores",
      description:
        "Gestiona tus proveedores con información de contacto y datos fiscales",
      icon: <Truck className="h-6 w-6" weight="duotone" />,
    },
    {
      id: "carriers",
      title: "Transportistas",
      description:
        "Importa tu lista de transportistas con nombre y datos de contacto",
      icon: <Van className="h-6 w-6" weight="duotone" />,
    },
    {
      id: "historical_sales",
      title: "Ventas Históricas",
      description:
        "Importa ventas agregadas por mes para visualización en el Dashboard",
      icon: <ChartLineUp className="h-6 w-6" weight="duotone" />,
    },
    {
      id: "historical_purchases",
      title: "Compras Históricas",
      description:
        "Importa compras agregadas por mes para visualización en el Dashboard",
      icon: <ShoppingCart className="h-6 w-6" weight="duotone" />,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl">Importar Datos</h1>
        <p className="max-w-3xl text-base text-muted-foreground leading-relaxed">
          Descarga las plantillas de Excel, completa los datos y luego
          impórtalos de manera masiva para agilizar la carga inicial de tu
          sistema.
        </p>
      </div>

      <ImportDataClient
        carriers={Array.from(new Set(carrierLabels)).sort((a, b) =>
          a.localeCompare(b)
        )}
        categories={categoryLabels}
        customers={Array.from(new Set(customerLabels)).sort((a, b) =>
          a.localeCompare(b)
        )}
        orgSlug={orgSlug}
        sellers={Array.from(new Set(sellerLabels)).sort((a, b) =>
          a.localeCompare(b)
        )}
        suppliers={Array.from(new Set(supplierLabels)).sort((a, b) =>
          a.localeCompare(b)
        )}
        templates={templates}
      />
    </div>
  );
}

function formatCategoryLabels(categories: Category[]): string[] {
  if (categories.length === 0) {
    return [];
  }

  const byId = new Map(categories.map((category) => [category.id, category]));
  const labels = categories
    .map((category) => {
      const chain: string[] = [];
      let current: Category | undefined = category;
      let guard = 0;

      while (current && guard < 10) {
        if (current.name?.trim()) {
          chain.unshift(current.name.trim());
        }
        current = current.parent_id ? byId.get(current.parent_id) : undefined;
        guard += 1;
      }

      return chain.join(" > ");
    })
    .filter((label) => label.length > 0);

  return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
}
