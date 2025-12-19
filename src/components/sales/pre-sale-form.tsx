"use client";

import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import type { OrganizationMember } from "@/modules/organizations/service/members.service";
import { usePreSaleMutation } from "@/modules/sales/hooks/use-pre-sale-mutation";
import type { InvoiceType, SaleProduct } from "@/modules/sales/types";
import { computeDueDate, toDateOnlyString } from "@/modules/sales/utils/date";

type PreSaleFormProps = {
  orgSlug: string;
  customers: Customer[];
  sellers: OrganizationMember[];
  products: SaleProduct[];
};

type ItemState = {
  productId: string;
  name: string;
  sku: string;
  brand?: string | null;
  quantity: number;
  unitPrice: number;
  basePrice: number;
  unitOfMeasure: SaleProduct["unitOfMeasure"];
  tracksStockUnits: boolean;
  averageQuantityPerUnit: number | null;
};

const invoiceTypeOptions: { value: InvoiceType; label: string }[] = [
  { value: "NOTA_DE_VENTA", label: "Nota de venta" },
  { value: "FACTURA_A", label: "Factura A" },
  { value: "FACTURA_B", label: "Factura B" },
  { value: "FACTURA_C", label: "Factura C" },
];

const textareaBaseClasses =
  "min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50";

const unitOfMeasureLabels: Record<SaleProduct["unitOfMeasure"], string> = {
  UN: "unidad",
  KG: "kg",
  LT: "lt",
  MT: "m",
};

const isWeightOrVolumeUnit = (
  unit: SaleProduct["unitOfMeasure"]
): unit is "KG" | "LT" => unit === "KG" || unit === "LT";

const formatAveragePerUnit = (
  average: number | null,
  unitOfMeasure: SaleProduct["unitOfMeasure"]
): string | null => {
  if (!average || average <= 0) {
    return null;
  }

  return `${average.toFixed(2)} ${unitOfMeasureLabels[unitOfMeasure]}/u`;
};

const formatPriceByMeasure = (
  price: number,
  unitOfMeasure: SaleProduct["unitOfMeasure"]
): string => `${formatCurrency(price)} x ${unitOfMeasureLabels[unitOfMeasure]}`;

const resolveAppliedUnitPrice = (product: SaleProduct): number => {
  const average = product.averageQuantityPerUnit;
  const shouldUseAverage =
    product.tracksStockUnits &&
    isWeightOrVolumeUnit(product.unitOfMeasure) &&
    average !== null &&
    average > 0;

  if (shouldUseAverage) {
    return product.price * average;
  }

  return product.price;
};

function buildSellerLabel(member: OrganizationMember): string {
  if (member.user?.name) {
    return member.user.name;
  }

  if (member.user?.email) {
    return member.user.email;
  }

  return "Usuario sin nombre";
}

export function PreSaleForm({
  orgSlug,
  customers,
  sellers,
  products,
}: PreSaleFormProps) {
  const [customerId, setCustomerId] = useState<string>("");
  const [sellerId, setSellerId] = useState<string>("");
  const [saleDate, setSaleDate] = useState<string>(() =>
    toDateOnlyString(new Date())
  );
  const [expirationDate, setExpirationDate] = useState<string>("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("NOTA_DE_VENTA");
  const [observations, setObservations] = useState<string>("");

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [selectedPrice, setSelectedPrice] = useState<number>(0);

  const [items, setItems] = useState<ItemState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { createPreSale } = usePreSaleMutation(orgSlug);

  const sellerOptions = useMemo(
    () =>
      sellers
        .filter((member) => Boolean(member.user_id))
        .map((member) => ({
          id: member.user_id,
          label: buildSellerLabel(member),
        })),
    [sellers]
  );

  useEffect(() => {
    if (!sellerId && sellerOptions.length) {
      setSellerId(sellerOptions[0].id);
    }
  }, [sellerId, sellerOptions]);

  useEffect(() => {
    const product = products.find((p) => p.id === selectedProductId);

    if (product) {
      setSelectedPrice(resolveAppliedUnitPrice(product));
    } else {
      setSelectedPrice(0);
    }
  }, [products, selectedProductId]);

  const totals = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );

    return {
      totalUnits,
      subtotal,
      totalItems: items.length,
    };
  }, [items]);

  const dueDate = useMemo(
    () => computeDueDate(saleDate, expirationDate || null),
    [saleDate, expirationDate]
  );

  const handleAddItem = () => {
    if (!selectedProductId) {
      setError("Selecciona un producto para agregarlo");
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);

    if (!product) {
      setError("Producto no encontrado");
      return;
    }

    if (!selectedQuantity || selectedQuantity <= 0) {
      setError("La cantidad debe ser mayor a 0");
      return;
    }

    const appliedUnitPrice = resolveAppliedUnitPrice(product);

    const unitPrice = Number.isFinite(selectedPrice)
      ? selectedPrice
      : appliedUnitPrice;

    setItems((prev) => {
      const exists = prev.find((item) => item.productId === product.id);

      if (exists) {
        return prev.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + selectedQuantity,
                unitPrice,
                basePrice: product.price,
                unitOfMeasure: product.unitOfMeasure,
                tracksStockUnits: product.tracksStockUnits,
                averageQuantityPerUnit: product.averageQuantityPerUnit,
              }
            : item
        );
      }

      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          sku: product.sku,
          brand: product.brand,
          quantity: selectedQuantity,
          unitPrice,
          basePrice: product.price,
          unitOfMeasure: product.unitOfMeasure,
          tracksStockUnits: product.tracksStockUnits,
          averageQuantityPerUnit: product.averageQuantityPerUnit,
        },
      ];
    });

    setSelectedProductId("");
    setSelectedQuantity(1);
    setSelectedPrice(0);
    setError(null);
  };

  const handleRemoveItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  };

  const canSubmit =
    Boolean(customerId) && Boolean(sellerId) && items.length > 0;
  const isSaving = createPreSale.isPending;

  const onSubmit = async () => {
    if (!canSubmit) {
      setError("Completa los datos requeridos antes de guardar");
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);

      await createPreSale.mutateAsync({
        customerId,
        sellerId,
        saleDate,
        expirationDate: expirationDate || null,
        invoiceType,
        observations: observations || null,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });

      setSuccessMessage("Preventa creada correctamente");
      setItems([]);
      setObservations("");
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "No se pudo guardar la preventa, intenta nuevamente"
      );
    }
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/org/${orgSlug}/preventa`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver a Preventas
          </Button>
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl">Nueva preventa</h1>
        <p className="text-muted-foreground text-sm">
          Completa los datos de la preventa y agrega los productos.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Datos de la preventa</CardTitle>
              <CardDescription>
                Define el cliente, el vendedor y la información general antes de
                agregar productos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customer">Cliente *</Label>
                  <Select
                    onValueChange={setCustomerId}
                    value={customerId || undefined}
                  >
                    <SelectTrigger className="w-full" id="customer">
                      <SelectValue placeholder="Selecciona un cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.fantasy_name || customer.business_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Selecciona el cliente de esta preventa.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seller">Vendedor *</Label>
                  <Select
                    onValueChange={setSellerId}
                    value={sellerId || undefined}
                  >
                    <SelectTrigger className="w-full" id="seller">
                      <SelectValue placeholder="Selecciona un vendedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {sellerOptions.map((seller) => (
                        <SelectItem key={seller.id} value={seller.id}>
                          {seller.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Usamos los usuarios de la organización como vendedores.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="saleDate">Fecha de venta *</Label>
                  <Input
                    id="saleDate"
                    onChange={(event) => setSaleDate(event.target.value)}
                    type="date"
                    value={saleDate}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expirationDate">Fecha de vencimiento</Label>
                  <Input
                    id="expirationDate"
                    onChange={(event) => setExpirationDate(event.target.value)}
                    placeholder="Seleccione una fecha"
                    type="date"
                    value={expirationDate}
                  />
                  <p className="text-muted-foreground text-xs">
                    Si la dejas vacía, usamos la fecha de venta.
                  </p>
                </div>
              </div>

              <div className="space-y-2 md:max-w-xs">
                <Label htmlFor="invoiceType">Tipo de comprobante</Label>
                <Select
                  onValueChange={(value) =>
                    setInvoiceType(value as InvoiceType)
                  }
                  value={invoiceType}
                >
                  <SelectTrigger className="w-full" id="invoiceType">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoiceTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observations">Observaciones</Label>
                <textarea
                  className={textareaBaseClasses}
                  id="observations"
                  onChange={(event) => setObservations(event.target.value)}
                  placeholder="Notas internas o comentarios del cliente"
                  value={observations}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Productos de la preventa
              </CardTitle>
              <CardDescription>
                Agrega los productos y cantidades de esta preventa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="grid grid-cols-[minmax(0,_2fr)_140px_auto] items-end gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="product">Producto</Label>
                    <Select
                      onValueChange={(value) => setSelectedProductId(value)}
                      value={selectedProductId || undefined}
                    >
                      <SelectTrigger className="w-full" id="product">
                        {selectedProduct ? (
                          <div className="flex flex-col text-left leading-tight">
                            <span className="truncate font-medium">
                              {selectedProduct.name}
                            </span>
                            <span className="truncate text-muted-foreground text-xs">
                              {selectedProduct.sku} ·{" "}
                              {formatPriceByMeasure(
                                selectedProduct.price,
                                selectedProduct.unitOfMeasure
                              )}
                            </span>
                          </div>
                        ) : (
                          <SelectValue placeholder="Selecciona un producto" />
                        )}
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {products.map((product) => {
                          const averageLabel =
                            product.tracksStockUnits &&
                            isWeightOrVolumeUnit(product.unitOfMeasure)
                              ? formatAveragePerUnit(
                                  product.averageQuantityPerUnit,
                                  product.unitOfMeasure
                                )
                              : null;

                          return (
                            <SelectItem key={product.id} value={product.id}>
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {product.name}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                  {product.sku} ·{" "}
                                  {formatPriceByMeasure(
                                    product.price,
                                    product.unitOfMeasure
                                  )}
                                </span>
                                {averageLabel ? (
                                  <span className="text-[11px] text-muted-foreground">
                                    Prom: {averageLabel} · Precio aplicado:{" "}
                                    {formatCurrency(
                                      resolveAppliedUnitPrice(product)
                                    )}{" "}
                                    x unidad
                                  </span>
                                ) : null}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="quantity">Cantidad</Label>
                    <Input
                      id="quantity"
                      inputMode="decimal"
                      min={0}
                      onChange={(event) => {
                        const parsed = Number.parseFloat(event.target.value);
                        setSelectedQuantity(Number.isNaN(parsed) ? 0 : parsed);
                      }}
                      step="0.01"
                      type="number"
                      value={
                        Number.isNaN(selectedQuantity) ? "" : selectedQuantity
                      }
                    />
                  </div>

                  <div className="flex items-end">
                    <Button
                      className="w-full md:w-auto"
                      onClick={handleAddItem}
                      type="button"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border">
                {items.length === 0 ? (
                  <Empty className="rounded-none border-none bg-transparent">
                    <EmptyContent>
                      <EmptyTitle>Sin productos agregados</EmptyTitle>
                      <EmptyDescription>
                        Selecciona un producto y cantidad para sumarlo a la
                        preventa.
                      </EmptyDescription>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <div className="divide-y">
                    {items.map((item) => {
                      const averageLabel = formatAveragePerUnit(
                        item.averageQuantityPerUnit,
                        item.unitOfMeasure
                      );
                      const isWeightTracked =
                        item.tracksStockUnits &&
                        isWeightOrVolumeUnit(item.unitOfMeasure);
                      const appliedPriceLabel = formatCurrency(item.unitPrice);

                      return (
                        <div
                          className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          key={item.productId}
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{item.name}</p>
                              {item.brand ? (
                                <span className="text-muted-foreground text-xs">
                                  {item.brand}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {item.sku} ·{" "}
                              {formatPriceByMeasure(
                                item.basePrice,
                                item.unitOfMeasure
                              )}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              Cantidad: {item.quantity}
                              {isWeightTracked ? (
                                <>
                                  {averageLabel ? (
                                    <>
                                      {" · "}Prom: {averageLabel}
                                    </>
                                  ) : null}
                                  {" · "}Precio aplicado: {appliedPriceLabel} x
                                  unidad
                                </>
                              ) : (
                                <>
                                  {" · "}Precio: {appliedPriceLabel} x unidad
                                </>
                              )}
                            </p>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-muted-foreground text-xs">
                                Subtotal
                              </p>
                              <p className="font-medium">
                                {formatCurrency(item.quantity * item.unitPrice)}
                              </p>
                            </div>
                            <Button
                              onClick={() => handleRemoveItem(item.productId)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="w-full lg:w-80 lg:max-w-xs xl:max-w-sm">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-lg">Resumen de preventa</CardTitle>
              <CardDescription>
                Totales y detalle de los productos agregados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Productos ({totals.totalItems})
                  </span>
                  <span>{totals.totalItems}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Unidades totales
                  </span>
                  <span>{totals.totalUnits}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between font-semibold text-base">
                  <span>Total</span>
                  <span>{formatCurrency(totals.subtotal)}</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  Vence el {formatDateOnly(dueDate)}
                </p>
              </div>

              {error ? (
                <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {error}
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700 text-sm">
                  {successMessage}
                </div>
              ) : null}
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                disabled={!canSubmit || isSaving}
                onClick={onSubmit}
                type="button"
              >
                {isSaving ? "Guardando..." : "Guardar preventa"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
