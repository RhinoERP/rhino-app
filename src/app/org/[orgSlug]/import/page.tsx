import {
  Barcode,
  ChartLineUp,
  Package,
  ShoppingCart,
  Truck,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { ImportDataClient } from "@/components/import/import-data-client";
import { getCategoriesByOrgSlug } from "@/modules/categories/service/categories.service";
import type { Category } from "@/modules/categories/types";

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
  const categories = await getCategoriesByOrgSlug(orgSlug);

  const categoryLabels = formatCategoryLabels(categories);

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
        <h1 className="font-bold font-heading text-3xl tracking-tight">
          Importar Datos
        </h1>
        <p className="max-w-3xl text-base text-muted-foreground leading-relaxed">
          Descarga las plantillas de Excel, completa los datos y luego
          impórtalos de manera masiva para agilizar la carga inicial de tu
          sistema.
        </p>
      </div>

      <ImportDataClient
        categories={categoryLabels}
        orgSlug={orgSlug}
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
