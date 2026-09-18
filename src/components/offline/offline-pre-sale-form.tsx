"use client";

import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  FloppyDiskIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
  ShoppingCartIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { truncateMoney } from "@/lib/decimal";
import { createOfflinePreSaleCommand } from "@/modules/offline/contracts/offline-command";
import {
  OFFLINE_PRE_SALE_DRAFT_SCHEMA_VERSION,
  type OfflinePreSaleDraft,
} from "@/modules/offline/contracts/offline-pre-sale-draft";
import type { SellerOfflineSnapshotV1 } from "@/modules/offline/contracts/seller-offline-snapshot";
import { buildOfflineProductPriceMap } from "@/modules/offline/pricing/offline-pre-sale-pricing";
import {
  deleteOfflineCommandForDraft,
  deleteOfflinePreSaleDraft,
  enqueueOfflineCommand,
  saveOfflinePreSaleDraft,
} from "@/modules/offline/storage/offline-db";
import { replayOfflineCommands } from "@/modules/offline/sync/offline-command-sync";
import { buildItemizedTaxPlan } from "@/modules/taxes/item-tax-calculations";

type OfflinePreSaleFormProps = {
  snapshot: SellerOfflineSnapshotV1;
  initialDraft: OfflinePreSaleDraft | null;
};

const normalize = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function formatMoney(value: number, currency = "ARS") {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
  }).format(value);
}

function createDraft(snapshot: SellerOfflineSnapshotV1): OfflinePreSaleDraft {
  const now = new Date().toISOString();
  return {
    draftId: crypto.randomUUID(),
    schemaVersion: OFFLINE_PRE_SALE_DRAFT_SCHEMA_VERSION,
    ownerUserId: snapshot.ownerUserId,
    organizationId: snapshot.organizationId,
    orgSlug: snapshot.organization.slug,
    snapshotId: snapshot.snapshotId,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    purgeAfterHours: snapshot.settings.purgeAfterHours,
    payload: {
      customerId: null,
      sellerId: snapshot.ownerUserId,
      paymentMethod: snapshot.settings.defaultPaymentMethod,
      invoiceType: snapshot.settings.defaultInvoiceType,
      notes: "",
      items: [],
    },
  };
}

export function OfflinePreSaleForm({
  snapshot,
  initialDraft,
}: OfflinePreSaleFormProps) {
  const [draft, setDraft] = useState<OfflinePreSaleDraft>(
    initialDraft ?? createDraft(snapshot)
  );
  const [productSearch, setProductSearch] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [isLeaving, setIsLeaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const priceMap = useMemo(
    () => buildOfflineProductPriceMap(snapshot, draft.payload.customerId),
    [draft.payload.customerId, snapshot]
  );
  const productsById = useMemo(
    () => new Map(snapshot.products.map((product) => [product.id, product])),
    [snapshot.products]
  );
  const filteredProducts = useMemo(() => {
    const query = normalize(productSearch);
    if (!query) {
      return snapshot.products.slice(0, 12);
    }
    return snapshot.products
      .filter((product) =>
        normalize(
          [product.name, product.sku, product.brand].join(" ")
        ).includes(query)
      )
      .slice(0, 20);
  }, [productSearch, snapshot.products]);
  const subtotal = truncateMoney(
    draft.payload.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    )
  );
  const fallbackTaxes = snapshot.settings.defaultTaxIds.flatMap((taxId) => {
    const tax = snapshot.taxes.find((entry) => entry.id === taxId);
    return tax
      ? [
          {
            taxId: tax.id,
            name: tax.name,
            rate: tax.rate,
            taxCodeSnapshot: tax.code,
            source: "fallback" as const,
          },
        ]
      : [];
  });
  const taxPlan = buildItemizedTaxPlan({
    lines: draft.payload.items.map((item) => ({
      lineId: item.lineId,
      productId: item.productId,
      netAmount: item.quantity * item.unitPrice,
      taxes: item.taxes.map((tax) => ({
        taxId: tax.taxId,
        name: tax.name,
        rate: tax.rate,
        taxCodeSnapshot: tax.code,
        source: "product",
      })),
    })),
    globalDiscountAmount: 0,
    fallbackTaxes,
  });
  const total = truncateMoney(subtotal + taxPlan.totalTaxAmount);
  const totalCurrency =
    productsById.get(draft.payload.items[0]?.productId ?? "")?.currency ??
    "ARS";

  useEffect(() => {
    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      saveOfflinePreSaleDraft({
        ...draft,
        updatedAt: new Date().toISOString(),
      })
        .then(() => setSaveState("saved"))
        .catch(() => toast.error("No se pudo guardar el borrador local"));
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [draft]);

  const updateItemsForCustomer = (customerId: string | null) => {
    const nextPrices = buildOfflineProductPriceMap(snapshot, customerId);
    setDraft((current) => ({
      ...current,
      payload: {
        ...current.payload,
        customerId,
        items: current.payload.items.map((item) => ({
          ...item,
          unitPrice: nextPrices.get(item.productId) ?? item.unitPrice,
        })),
      },
    }));
  };

  const addProduct = (productId: string) => {
    const product = productsById.get(productId);
    if (!product) {
      return;
    }
    const currentCurrencies = new Set(
      draft.payload.items.flatMap((item) => {
        const currency = productsById.get(item.productId)?.currency;
        return currency ? [currency] : [];
      })
    );
    if (
      currentCurrencies.size > 0 &&
      !currentCurrencies.has(product.currency)
    ) {
      toast.error("El borrador offline no puede mezclar monedas");
      return;
    }
    setDraft((current) => {
      const existing = current.payload.items.find(
        (item) => item.productId === productId
      );
      const items = existing
        ? current.payload.items.map((item) =>
            item.productId === productId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        : [
            ...current.payload.items,
            {
              lineId: crypto.randomUUID(),
              productId,
              quantity: 1,
              unitPrice: priceMap.get(productId) ?? product.price,
              taxes: product.taxes,
            },
          ];
      return { ...current, payload: { ...current.payload, items } };
    });
  };

  const updateQuantity = (lineId: string, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return;
    }
    setDraft((current) => ({
      ...current,
      payload: {
        ...current.payload,
        items: current.payload.items.map((item) =>
          item.lineId === lineId ? { ...item, quantity } : item
        ),
      },
    }));
  };

  const removeItem = (lineId: string) => {
    setDraft((current) => ({
      ...current,
      payload: {
        ...current.payload,
        items: current.payload.items.filter((item) => item.lineId !== lineId),
      },
    }));
  };

  const clearDraft = async () => {
    await deleteOfflineCommandForDraft(draft.draftId);
    await deleteOfflinePreSaleDraft(draft.draftId);
    window.location.assign("/~offline/borradores");
  };

  const returnToDrafts = async () => {
    setIsLeaving(true);
    setSaveState("saving");
    try {
      await saveOfflinePreSaleDraft({
        ...draft,
        updatedAt: new Date().toISOString(),
      });
      window.location.assign("/~offline/borradores");
    } catch {
      setIsLeaving(false);
      setSaveState("saved");
      toast.error("No se pudo guardar el borrador local");
    }
  };

  // Enqueue, immediate replay and user feedback form a single UI transaction.
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: explicit states keep sync outcomes visible
  const enqueueDraft = async () => {
    if (!draft.payload.customerId) {
      toast.error("Seleccioná un cliente antes de enviar");
      return;
    }
    if (draft.payload.items.length === 0) {
      toast.error("Agregá al menos un producto antes de enviar");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const savedDraft = await saveOfflinePreSaleDraft({
        ...draft,
        updatedAt: now.toISOString(),
      });
      const command = createOfflinePreSaleCommand({
        commandId: crypto.randomUUID(),
        createdAt: now.toISOString(),
        draft: savedDraft,
        saleDate: [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, "0"),
          String(now.getDate()).padStart(2, "0"),
        ].join("-"),
        snapshot,
      });
      const queued = await enqueueOfflineCommand(draft.draftId, command);

      if (queued.status === "requires-review" || queued.status === "failed") {
        toast.error(
          queued.lastError?.message ?? "La preventa requiere revision"
        );
        window.location.assign("/~offline/borradores");
        return;
      }
      if (queued.status === "synced") {
        toast.success("La preventa ya fue sincronizada");
        window.location.assign("/~offline/borradores");
        return;
      }

      const [result] = await replayOfflineCommands(queued.commandId);
      if (result?.status === "synced") {
        toast.success("Preventa sincronizada correctamente");
      } else if (result?.status === "requires-review") {
        toast.error(
          result.lastError?.message ?? "La preventa requiere revision"
        );
      } else if (result?.status === "failed") {
        toast.error(
          result.lastError?.message ?? "No se pudo enviar la preventa"
        );
      } else {
        toast.success("Preventa guardada en la cola de sincronizacion");
      }
      window.location.assign("/~offline/borradores");
    } catch {
      toast.error("No se pudo encolar la preventa");
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-dvh bg-muted/30 pb-8">
      <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button
            aria-label="Guardar y volver a borradores"
            disabled={isLeaving}
            onClick={returnToDrafts}
            size="icon-sm"
            variant="ghost"
          >
            {isLeaving ? (
              <ArrowClockwiseIcon className="animate-spin" />
            ) : (
              <ArrowLeftIcon />
            )}
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">Preventa offline</h1>
            <p className="truncate text-muted-foreground text-xs">
              {snapshot.organization.name} · Solo borrador local
            </p>
          </div>
          <Badge variant="secondary">
            <FloppyDiskIcon />{" "}
            {saveState === "saving" ? "Guardando" : "Guardado"}
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <WarningCircleIcon className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <p>
            Esta preventa permanece en este dispositivo. Todavía no se enviará
            al servidor al recuperar conexión.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              onChange={(event) =>
                updateItemsForCustomer(event.target.value || null)
              }
              value={draft.payload.customerId ?? ""}
            >
              <option value="">Seleccionar cliente</option>
              {snapshot.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fantasyName || customer.businessName}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agregar productos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <MagnifyingGlassIcon className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Buscar por nombre o SKU"
                value={productSearch}
              />
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {filteredProducts.map((product) => (
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left hover:bg-muted/50"
                  key={product.id}
                  onClick={() => addProduct(product.id)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-sm">
                      {product.name}
                    </span>
                    <span className="block text-muted-foreground text-xs">
                      {product.sku} · Stock {product.totalQuantity ?? 0}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium text-sm">
                    {formatMoney(
                      priceMap.get(product.id) ?? product.price,
                      product.currency
                    )}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCartIcon /> Productos ({draft.payload.items.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {draft.payload.items.length === 0 && (
              <p className="py-6 text-center text-muted-foreground text-sm">
                Todavía no agregaste productos.
              </p>
            )}
            {draft.payload.items.map((item) => {
              const product = productsById.get(item.productId);
              if (!product) {
                return null;
              }
              return (
                <div className="rounded-lg border p-3" key={item.lineId}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-sm">
                        {product.name}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatMoney(item.unitPrice, product.currency)} por{" "}
                        {product.unitOfMeasure}
                      </p>
                    </div>
                    <Button
                      aria-label={`Quitar ${product.name}`}
                      onClick={() => removeItem(item.lineId)}
                      size="icon-sm"
                      variant="ghost"
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1">
                      <Button
                        aria-label="Restar cantidad"
                        disabled={item.quantity <= 1}
                        onClick={() =>
                          updateQuantity(item.lineId, item.quantity - 1)
                        }
                        size="icon-sm"
                        variant="outline"
                      >
                        <MinusIcon />
                      </Button>
                      <Input
                        className="w-20 text-center"
                        min="0.01"
                        onChange={(event) =>
                          updateQuantity(
                            item.lineId,
                            event.target.valueAsNumber
                          )
                        }
                        step="0.01"
                        type="number"
                        value={item.quantity}
                      />
                      <Button
                        aria-label="Sumar cantidad"
                        onClick={() =>
                          updateQuantity(item.lineId, item.quantity + 1)
                        }
                        size="icon-sm"
                        variant="outline"
                      >
                        <PlusIcon />
                      </Button>
                    </div>
                    <p className="font-semibold">
                      {formatMoney(
                        item.quantity * item.unitPrice,
                        product.currency
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <Label htmlFor="offline-notes">Observaciones</Label>
              <Textarea
                id="offline-notes"
                maxLength={1000}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    payload: { ...current.payload, notes: event.target.value },
                  }))
                }
                placeholder="Opcional"
                value={draft.payload.notes}
              />
            </div>
            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatMoney(subtotal, totalCurrency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Impuestos</span>
                <span>
                  {formatMoney(taxPlan.totalTaxAmount, totalCurrency)}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-base">
                <span>Total estimado</span>
                <span>{formatMoney(total, totalCurrency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          className="w-full"
          disabled={isSubmitting}
          onClick={enqueueDraft}
        >
          {isSubmitting ? (
            <ArrowClockwiseIcon className="animate-spin" />
          ) : (
            <PaperPlaneTiltIcon />
          )}
          {isSubmitting ? "Preparando envío" : "Enviar preventa"}
        </Button>

        <Button
          className="w-full"
          disabled={isSubmitting}
          onClick={clearDraft}
          variant="outline"
        >
          <TrashIcon /> Eliminar borrador local
        </Button>
      </div>
    </main>
  );
}
