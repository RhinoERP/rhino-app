"use client";

import {
  ArrowClockwiseIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  UsersIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getActiveSellerSnapshot,
  isSellerSnapshotExpired,
  type StoredSellerSnapshot,
} from "@/modules/offline/storage/offline-db";

type View = "customers" | "products";

const normalize = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export default function OfflineDataPage() {
  const [record, setRecord] = useState<StoredSellerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("customers");

  useEffect(() => {
    getActiveSellerSnapshot()
      .then(setRecord)
      .finally(() => setLoading(false));
  }, []);

  const normalizedQuery = normalize(query);
  const customers = useMemo(
    () =>
      (record?.snapshot.customers ?? []).filter((customer) =>
        normalize(
          [
            customer.businessName,
            customer.fantasyName,
            customer.clientNumber,
            customer.cuit,
            customer.city,
          ].join(" ")
        ).includes(normalizedQuery)
      ),
    [normalizedQuery, record]
  );
  const products = useMemo(
    () =>
      (record?.snapshot.products ?? []).filter((product) =>
        normalize(
          [product.name, product.sku, product.brand, product.supplierName].join(
            " "
          )
        ).includes(normalizedQuery)
      ),
    [normalizedQuery, record]
  );

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <ArrowClockwiseIcon className="size-7 animate-spin text-primary" />
      </main>
    );
  }

  if (!record) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background p-6">
        <section className="w-full max-w-sm text-center">
          <WarningCircleIcon className="mx-auto size-12 text-muted-foreground" />
          <h1 className="mt-4 font-semibold text-xl">
            No hay datos descargados
          </h1>
          <p className="mt-2 text-muted-foreground text-sm">
            Conectate, abrí Rhinos y elegí Preparar datos offline.
          </p>
          <Button asChild className="mt-6 w-full">
            <a href="/">Volver a Rhinos</a>
          </Button>
        </section>
      </main>
    );
  }

  const { snapshot } = record;
  const expired = isSellerSnapshotExpired(snapshot);

  return (
    <main className="min-h-dvh bg-muted/30 pb-8">
      <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Image
            alt="Rhinos"
            className="rounded-lg"
            height={40}
            priority
            src="/icons/pwa-192x192.png"
            width={40}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">
              {snapshot.organization.name}
            </p>
            <p className="text-muted-foreground text-xs">
              Datos actualizados{" "}
              {formatDistanceToNow(new Date(record.downloadedAt), {
                addSuffix: true,
                locale: es,
              })}
            </p>
          </div>
          <Badge variant={expired ? "destructive" : "secondary"}>
            {expired ? "Vencidos" : "Offline"}
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 p-4">
        {expired && (
          <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <WarningCircleIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
            <p>
              Estos datos están vencidos. Podés consultarlos como referencia,
              pero necesitás actualizarlos antes de crear nuevas operaciones.
            </p>
          </div>
        )}

        {!expired && (
          <Button asChild className="w-full">
            <a href="/~offline/borradores">Ver borradores de preventa</a>
          </Button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => setView("customers")}
            variant={view === "customers" ? "default" : "outline"}
          >
            <UsersIcon /> Clientes ({snapshot.customers.length})
          </Button>
          <Button
            onClick={() => setView("products")}
            variant={view === "products" ? "default" : "outline"}
          >
            <PackageIcon /> Productos ({snapshot.products.length})
          </Button>
        </div>

        <div className="relative">
          <MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              view === "customers" ? "Buscar cliente" : "Buscar producto"
            }
            value={query}
          />
        </div>

        <div className="space-y-2">
          {view === "customers"
            ? customers.map((customer) => (
                <Card key={customer.id}>
                  <CardContent className="p-4">
                    <p className="font-medium">
                      {customer.fantasyName || customer.businessName}
                    </p>
                    {customer.fantasyName && (
                      <p className="text-muted-foreground text-sm">
                        {customer.businessName}
                      </p>
                    )}
                    <p className="mt-1 text-muted-foreground text-xs">
                      {[customer.clientNumber, customer.cuit, customer.city]
                        .filter(Boolean)
                        .join(" · ") || "Sin datos adicionales"}
                    </p>
                  </CardContent>
                </Card>
              ))
            : products.map((product) => (
                <Card key={product.id}>
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{product.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {[product.sku, product.brand, product.supplierName]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        Stock de referencia: {product.totalQuantity ?? 0}{" "}
                        {product.unitOfMeasure}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold">
                      {new Intl.NumberFormat("es-AR", {
                        style: "currency",
                        currency: product.currency,
                      }).format(product.price)}
                    </p>
                  </CardContent>
                </Card>
              ))}
        </div>

        <Button asChild className="w-full" variant="outline">
          <a href="/">Volver a Rhinos</a>
        </Button>
      </div>
    </main>
  );
}
