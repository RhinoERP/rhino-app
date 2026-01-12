import {
  Barcode,
  Package,
  Truck,
  UserCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { ImportDataClient } from "@/components/import/import-data-client";

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
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Importar Datos</h1>
        <p className="text-muted-foreground text-sm">
          Descarga las plantillas de Excel, completa los datos y luego
          impórtalos de manera masiva para agilizar la carga inicial de tu
          sistema.
        </p>
      </div>

      <ImportDataClient orgSlug={orgSlug} templates={templates} />
    </div>
  );
}
