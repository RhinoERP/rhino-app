"use client";

import { ArrowClockwiseIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { SalesQuoteRequestForm } from "@/components/sales-quote-requests/sales-quote-request-form";
import { Button } from "@/components/ui/button";
import type { Customer } from "@/modules/customers/types";
import type { SellerOfflineSnapshotV1 } from "@/modules/offline/contracts/seller-offline-snapshot";
import {
  getActiveSellerSnapshot,
  isSellerSnapshotExpired,
} from "@/modules/offline/storage/offline-db";
import type { PriceLevelWithStatus } from "@/modules/price-levels/types";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";

type SnapshotRecord = Awaited<ReturnType<typeof getActiveSellerSnapshot>>;

function customersFromSnapshot(snapshot: SellerOfflineSnapshotV1): Customer[] {
  return snapshot.customers.map(
    (customer) =>
      ({
        id: customer.id,
        business_name: customer.businessName,
        fantasy_name: customer.fantasyName,
        client_number: customer.clientNumber,
        cuit: customer.cuit,
        city: customer.city,
        assigned_seller_id: customer.assignedSellerId,
        price_level_id: customer.priceLevelId ?? null,
        sales_price_list_id: customer.salesPriceListId,
      }) as Customer
  );
}

function productsFromSnapshot(
  snapshot: SellerOfflineSnapshotV1
): SaleProduct[] {
  return snapshot.products.map(
    (product) =>
      ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        currency: product.currency,
        brand: product.brand,
        supplierId: product.supplierId,
        supplierName: product.supplierName,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        unitOfMeasure: product.unitOfMeasure,
        tracksStockUnits: product.tracksStockUnits,
        totalQuantity: product.totalQuantity,
        totalUnitQuantity: product.totalUnitQuantity,
        averageQuantityPerUnit: product.averageQuantityPerUnit,
        weightPerUnit: product.weightPerUnit,
        unitsPerBox: product.unitsPerBox,
        boxesPerPallet: product.boxesPerPallet,
        hasVariants: false,
        taxes: product.taxes.map((tax) => ({
          taxId: tax.taxId,
          name: tax.name,
          rate: tax.rate,
          taxCodeSnapshot: tax.code,
          source: "product" as const,
        })),
      }) as SaleProduct
  );
}

function priceLevelsFromSnapshot(
  snapshot: SellerOfflineSnapshotV1
): PriceLevelWithStatus[] {
  return (snapshot.priceLevels ?? [])
    .filter((level) => level.status === "Active" && level.isActive)
    .map(
      (level) =>
        ({
          id: level.id,
          name: level.name,
          margin: level.margin,
          valid_from: level.validFrom,
          is_active: level.isActive,
          extra_commission_rate: level.extraCommissionRate,
          status: level.status,
        }) as PriceLevelWithStatus
    );
}

function salesPriceListsFromSnapshot(
  snapshot: SellerOfflineSnapshotV1
): SalesPriceList[] {
  return snapshot.salesPriceLists.map(
    (list) =>
      ({
        id: list.id,
        name: list.name,
        type: list.type,
        value: list.value,
        valid_from: list.validFrom,
        status: "Active",
      }) as SalesPriceList
  );
}

export default function OfflineCompetitiveQuotesPage() {
  const [record, setRecord] = useState<SnapshotRecord>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    getActiveSellerSnapshot()
      .then(setRecord)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <ArrowClockwiseIcon className="size-7 animate-spin text-primary" />
      </main>
    );
  }

  if (!record?.signature) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <section className="w-full max-w-sm text-center">
          <WarningCircleIcon className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 font-semibold text-xl">
            Cotizaciones offline no preparadas
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            {loadError
              ? "No se pudieron leer los datos locales. Volvé a intentar abrir esta pantalla."
              : "Con conexión, abrí Rhinos y prepará los datos offline antes de iniciar una cotización sin red."}
          </p>
          <Button asChild className="mt-6 w-full">
            <a href="/~offline">Volver</a>
          </Button>
        </section>
      </main>
    );
  }

  const { snapshot } = record;
  const expired = isSellerSnapshotExpired(snapshot);
  const snapshotPriceByLevel = Object.fromEntries(
    snapshot.products.map((product) => [
      product.id,
      Object.fromEntries(
        (product.priceByLevel ?? []).map((entry) => [
          entry.priceLevelId,
          entry.price,
        ])
      ),
    ])
  );

  return (
    <main className="min-h-dvh bg-background p-3 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl">Cotizador competitivo</h1>
            <p className="text-muted-foreground text-sm">
              Cotización local; se enviará a aprobación al recuperar conexión.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href="/~offline">Volver a opciones offline</a>
          </Button>
        </div>
        {expired && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            El snapshot está vencido. Podés preparar la cotización con estos
            datos y el aprobador verá el aviso al sincronizarla.
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Sin conexión solo están disponibles productos incluidos en el
          snapshot; los productos con variantes no se descargan para el flujo
          offline.
        </p>
        <SalesQuoteRequestForm
          customers={customersFromSnapshot(snapshot)}
          organizationId={snapshot.organizationId}
          orgSlug={snapshot.organization.slug}
          ownerUserId={snapshot.ownerUserId}
          priceLevels={priceLevelsFromSnapshot(snapshot)}
          products={productsFromSnapshot(snapshot)}
          salesPriceLists={salesPriceListsFromSnapshot(snapshot)}
          snapshotPriceByLevel={snapshotPriceByLevel}
          variants={[]}
        />
      </div>
    </main>
  );
}
