"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FileImage, FilePdf } from "@phosphor-icons/react";
import { Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import type { Customer } from "@/modules/customers/types";
import {
  type QuoteFormValues,
  type QuoteItemVariantFormValues,
  quoteFormSchema,
} from "@/modules/quotes/types";
import type { SaleProduct } from "@/modules/sales/types";
import type { SalesPriceList } from "@/modules/sales-price-lists/types";
import { ProductSearch } from "./product-search";
import { ProductVariantsGridDialog } from "./product-variants-grid-dialog";
import { QuoteItemExtrasPopover } from "./quote-item-extras-popover";

const NO_PRICE_LIST = "none";

async function fetchBlueRate(): Promise<number> {
  const res = await fetch("/api/exchange-rate/blue");
  if (!res.ok) {
    throw new Error("Error al obtener la cotización");
  }
  const data = (await res.json()) as { venta: number };
  return data.venta;
}

function convertItemsToCurrency(
  items: QuoteFormValues["items"],
  rate: number,
  divide: boolean
): QuoteFormValues["items"] {
  return items.map((item) => ({
    ...item,
    unitPrice: divide
      ? truncateMoney(item.unitPrice / rate)
      : truncateMoney(item.unitPrice * rate),
    subtotal: divide
      ? truncateMoney(item.subtotal / rate)
      : truncateMoney(item.subtotal * rate),
  }));
}

function getDisplayName(
  file: File | null | undefined,
  url: string | null | undefined,
  label: string
): string | null {
  if (file) {
    return file.name;
  }
  if (url) {
    return label;
  }
  return null;
}

type QuoteFormProps = {
  orgSlug: string;
  customers: Customer[];
  products: SaleProduct[];
  salesPriceLists: SalesPriceList[];
  onSubmit: (values: QuoteFormValues) => void;
  isSubmitting?: boolean;
  defaultValues?: Partial<QuoteFormValues>;
  submitLabel?: string;
  selectedFile?: File | null;
  onFileSelect?: (file: File | null) => void;
  selectedDesignFile?: File | null;
  onDesignFileSelect?: (file: File | null) => void;
  onCancel?: () => void;
};

export function QuoteForm({
  orgSlug,
  salesPriceLists,
  customers,
  products,
  onSubmit,
  isSubmitting,
  defaultValues,
  submitLabel = "Guardar Presupuesto",
  selectedFile,
  onFileSelect,
  selectedDesignFile,
  onDesignFileSelect,
  onCancel,
}: QuoteFormProps) {
  const [selectedProduct, setSelectedProduct] = useState<SaleProduct | null>(
    null
  );
  const [isGridOpen, setIsGridOpen] = useState(false);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [convertingCurrency, setConvertingCurrency] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const designFileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      customerId: "",
      salesPriceListId: NO_PRICE_LIST,
      currency: "ARS",
      items: [],
      notes: "",
      ...defaultValues,
    } as QuoteFormValues,
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const handleProductSelect = (product: SaleProduct, quantity = 1) => {
    setSelectedProduct(product);
    if (product.hasVariants) {
      setIsGridOpen(true);
      return;
    }
    const unitPrice = getUnitPrice(product);
    append({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unitPrice,
      variants: [
        {
          talle: "\u00danico",
          color: "\u2014",
          quantity,
        },
      ],
      totalQuantity: quantity,
      extras: [],
      subtotal: truncateMoney(unitPrice * quantity),
    });
    setSelectedProduct(null);
  };

  const getUnitPrice = (product: SaleProduct) => {
    const salesPriceListId = form.getValues("salesPriceListId");
    const listPercentage = salesPriceLists.find(
      (pl) => pl.id === salesPriceListId
    )?.percentage;
    if (listPercentage !== undefined) {
      return truncateMoney((product.price || 0) * (1 + listPercentage / 100));
    }
    return product.price || 0;
  };

  const handleVariantsConfirm = (variants: QuoteItemVariantFormValues[]) => {
    if (!selectedProduct) {
      return;
    }

    const totalQuantity = variants.reduce((acc, v) => acc + v.quantity, 0);

    const unitPrice = getUnitPrice(selectedProduct);

    const subtotal = truncateMoney(totalQuantity * unitPrice);

    append({
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      sku: selectedProduct.sku,
      unitPrice,
      variants,
      totalQuantity,
      extras: [],
      subtotal,
    });

    setSelectedProduct(null);
  };

  const currentFileUrl =
    useWatch({
      control: form.control,
      name: "purchaseOrderFile",
    }) ?? null;

  const currentDesignFileUrl =
    useWatch({
      control: form.control,
      name: "designFile",
    }) ?? null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (file && file.type !== "application/pdf") {
      return;
    }
    onFileSelect?.(file);
    form.setValue("purchaseOrderFile", file ? "selected" : null, {
      shouldDirty: true,
    });
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleDesignFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    onDesignFileSelect?.(file);
    form.setValue("designFile", file ? "selected" : null, {
      shouldDirty: true,
    });
    if (e.target) {
      e.target.value = "";
    }
  };

  const handleRemoveFile = () => {
    onFileSelect?.(null);
    form.setValue("purchaseOrderFile", null, { shouldDirty: true });
  };

  const handleRemoveDesignFile = () => {
    onDesignFileSelect?.(null);
    form.setValue("designFile", null, { shouldDirty: true });
  };

  const displayName = getDisplayName(
    selectedFile,
    currentFileUrl,
    "Orden de compra adjunta"
  );

  const designDisplayName = getDisplayName(
    selectedDesignFile,
    currentDesignFileUrl,
    "Boceto adjunto"
  );

  const isDesignImage = selectedDesignFile?.type.startsWith("image/") ?? false;

  const formItems = useWatch({ control: form.control, name: "items" }) ?? [];
  const quoteTotal = formItems.reduce(
    (acc, item) => acc + (item?.subtotal ?? 0),
    0
  );

  const selectedPriceListId = useWatch({
    control: form.control,
    name: "salesPriceListId",
  });

  const selectedCustomerId = useWatch({
    control: form.control,
    name: "customerId",
  });

  const currency = useWatch({
    control: form.control,
    name: "currency",
  });

  useEffect(() => {
    if (!selectedCustomerId) {
      return;
    }
    const customer = customers.find((c) => c.id === selectedCustomerId);
    const priceListId = customer?.sales_price_list_id ?? NO_PRICE_LIST;
    form.setValue("salesPriceListId", priceListId);
  }, [selectedCustomerId, customers, form]);

  useEffect(() => {
    if (fields.length === 0) {
      return;
    }

    const listPercentage = salesPriceLists.find(
      (pl) => pl.id === selectedPriceListId
    )?.percentage;

    const currentItems = form.getValues("items");

    const updatedItems = currentItems.map((item) => {
      const basePrice =
        products.find((p) => p.id === item.productId)?.price ?? 0;

      const newUnitPrice =
        listPercentage !== undefined
          ? truncateMoney(basePrice * (1 + listPercentage / 100))
          : basePrice;

      const extrasTotal = (item.extras || []).reduce(
        (acc, e) => acc + e.price,
        0
      );

      return {
        ...item,
        unitPrice: newUnitPrice,
        subtotal: truncateMoney(
          (newUnitPrice + extrasTotal) * item.totalQuantity
        ),
      };
    });

    form.setValue("items", updatedItems, { shouldDirty: true });
  }, [selectedPriceListId, salesPriceLists, form, products, fields.length]);

  const handleConvertCurrency = async () => {
    if (convertingCurrency) {
      return;
    }

    if (currency === "ARS") {
      setConvertingCurrency(true);
      try {
        const rate = await fetchBlueRate();
        setExchangeRate(rate);

        const currentItems = form.getValues("items");
        form.setValue(
          "items",
          convertItemsToCurrency(currentItems, rate, true),
          {
            shouldDirty: true,
          }
        );
        form.setValue("currency", "USD");
        form.setValue("exchangeRate", rate);
      } catch {
        toast.error("No se pudo obtener la cotización del dólar blue");
      } finally {
        setConvertingCurrency(false);
      }
    } else if (exchangeRate) {
      const currentItems = form.getValues("items");
      form.setValue(
        "items",
        convertItemsToCurrency(currentItems, exchangeRate, false),
        { shouldDirty: true }
      );
      form.setValue("currency", "ARS");
      form.setValue("exchangeRate", null);
      setExchangeRate(null);
    }
  };

  useEffect(() => {
    if (defaultValues?.exchangeRate) {
      setExchangeRate(defaultValues.exchangeRate);
    }
  }, [defaultValues?.exchangeRate]);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="flex flex-col gap-6 lg:col-span-8">
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            {/* Detalles principales del presupuesto */}
            <Card>
              <CardHeader>
                <CardTitle>Detalles del Presupuesto</CardTitle>
                <CardDescription>
                  Selecciona el cliente, lista de precios y moneda.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cliente</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccione un cliente" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customers.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.business_name || c.fantasy_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salesPriceListId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lista de Precios</FormLabel>
                        <Select
                          disabled
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Ninguna / Precio base" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={NO_PRICE_LIST}>
                              Ninguna / Precio base
                            </SelectItem>
                            {salesPriceLists.map((pl) => (
                              <SelectItem key={pl.id} value={pl.id}>
                                {pl.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Moneda</FormLabel>
                        <FormControl>
                          <input type="hidden" {...field} />
                        </FormControl>
                        <div className="flex h-9 items-center rounded-md border px-3 text-sm">
                          {field.value === "USD"
                            ? "USD - Dólares"
                            : "ARS - Pesos Arg."}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                {fields.length > 0 && (
                  <ConvertCurrencySection
                    convertingCurrency={convertingCurrency}
                    currency={currency}
                    exchangeRate={exchangeRate}
                    onConvert={handleConvertCurrency}
                  />
                )}
              </CardContent>
            </Card>

            {/* Ítems del Presupuesto */}
            <Card>
              <CardHeader>
                <CardTitle>Productos</CardTitle>
                <CardDescription>
                  Agregue los productos y talles al presupuesto.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6">
                  {/* Buscador */}
                  <ProductSearch
                    onSelectProduct={handleProductSelect}
                    priceListPercentage={
                      salesPriceLists.find(
                        (pl) => pl.id === selectedPriceListId
                      )?.percentage
                    }
                    products={products}
                  />

                  {/* Tabla de ítems seleccionados */}
                  {fields.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead>Talles</TableHead>
                            <TableHead className="text-right">
                              Precio Un.
                            </TableHead>
                            <TableHead className="text-right">Extras</TableHead>
                            <TableHead className="text-right">
                              Cantidad
                            </TableHead>
                            <TableHead className="text-right">
                              Subtotal
                            </TableHead>
                            <TableHead className="w-[50px]" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fields.map((field, index) => {
                            const item = formItems[index] || field;
                            return (
                              <TableRow key={field.id}>
                                <TableCell>
                                  <div className="font-medium">
                                    {item.productName}
                                  </div>
                                  {item.sku && (
                                    <div className="text-muted-foreground text-xs">
                                      {item.sku}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {item.variants.map((v) => (
                                      <span
                                        className="inline-flex items-center rounded-md bg-muted px-2 py-1 font-medium text-xs"
                                        key={`${v.talle}-${v.color}`}
                                      >
                                        {v.talle} / {v.color}: {v.quantity}
                                      </span>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.unitPrice, currency)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <QuoteItemExtrasPopover
                                    extras={item.extras || []}
                                    onChange={(newExtras) => {
                                      const extrasTotal = newExtras.reduce(
                                        (acc, e) => acc + e.price,
                                        0
                                      );
                                      const newSubtotal = truncateMoney(
                                        (item.unitPrice + extrasTotal) *
                                          item.totalQuantity
                                      );
                                      update(index, {
                                        ...item,
                                        extras: newExtras,
                                        subtotal: newSubtotal,
                                      });
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {item.totalQuantity}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(item.subtotal, currency)}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    onClick={() => remove(index)}
                                    size="icon"
                                    type="button"
                                    variant="ghost"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-md border border-dashed text-muted-foreground text-sm">
                      No hay productos agregados. Utilice el buscador para
                      añadir.
                    </div>
                  )}
                  {form.formState.errors.items && (
                    <p className="font-medium text-destructive text-sm">
                      {form.formState.errors.items.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Notas Adicionales */}
            <Card>
              <CardHeader>
                <CardTitle>Notas (opcional)</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea
                          className="resize-none"
                          placeholder="Ingrese condiciones comerciales, tiempo de entrega, etc..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4 lg:hidden">
              <Button
                disabled={isSubmitting || fields.length === 0}
                type="submit"
              >
                {isSubmitting ? "Guardando..." : submitLabel}
              </Button>
            </div>
          </form>
        </Form>
      </div>

      {/* Panel lateral / Resumen */}
      <div className="flex flex-col gap-6 lg:col-span-4">
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle>Resumen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Cantidad de ítems:
                </span>
                <span className="font-medium">{fields.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Total de prendas/unidades:
                </span>
                <span className="font-medium">
                  {formItems.reduce((acc, it) => acc + it.totalQuantity, 0)}
                </span>
              </div>
              <div className="my-4 h-px bg-border" />

              <FileUploadCard
                accept="application/pdf"
                currentUrl={currentFileUrl}
                displayName={displayName}
                inputRef={fileInputRef}
                isImage={false}
                label="Orden de compra (PDF)"
                onChange={handleFileSelect}
                onRemove={handleRemoveFile}
                selectedFile={selectedFile}
              />

              <FileUploadCard
                accept="application/pdf,image/png,image/jpeg"
                currentUrl={currentDesignFileUrl}
                displayName={designDisplayName}
                inputRef={designFileInputRef}
                isImage={isDesignImage}
                label="Boceto / Diseño (PDF, PNG, JPEG)"
                onChange={handleDesignFileSelect}
                onRemove={handleRemoveDesignFile}
                selectedFile={selectedDesignFile}
              />

              <div className="my-4 h-px bg-border" />
              <div className="flex items-center justify-between font-bold text-lg">
                <span>Total:</span>
                <span>{formatCurrency(quoteTotal, currency)}</span>
              </div>
              <div className="hidden flex-col gap-2 pt-4 lg:flex">
                <Button
                  className="w-full"
                  disabled={isSubmitting || fields.length === 0}
                  onClick={form.handleSubmit(onSubmit)}
                  size="lg"
                >
                  {isSubmitting ? "Guardando..." : submitLabel}
                </Button>
                {onCancel && (
                  <Button
                    className="w-full"
                    disabled={isSubmitting}
                    onClick={onCancel}
                    type="button"
                    variant="outline"
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ProductVariantsGridDialog
        isOpen={isGridOpen}
        key={selectedProduct ? selectedProduct.id : "empty"}
        onConfirm={handleVariantsConfirm}
        onOpenChange={setIsGridOpen}
        orgSlug={orgSlug}
        product={selectedProduct}
      />
    </div>
  );
}

function ConvertCurrencySection({
  convertingCurrency,
  currency,
  exchangeRate,
  onConvert,
}: {
  convertingCurrency: boolean;
  currency: string;
  exchangeRate: number | null;
  onConvert: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t pt-4">
      {currency === "ARS" ? (
        <Button
          disabled={convertingCurrency}
          onClick={onConvert}
          size="sm"
          type="button"
          variant="outline"
        >
          {convertingCurrency
            ? "Obteniendo cotización..."
            : "Convertir a Dólares"}
        </Button>
      ) : (
        <Button onClick={onConvert} size="sm" type="button" variant="outline">
          Convertir a Pesos
        </Button>
      )}
      {currency === "USD" && exchangeRate && (
        <span className="text-muted-foreground text-sm">
          Cotización: {formatCurrency(exchangeRate, "ARS")}
        </span>
      )}
    </div>
  );
}

function FileUploadCard({
  label,
  accept,
  displayName,
  currentUrl,
  selectedFile,
  isImage,
  inputRef,
  onChange,
  onRemove,
}: {
  label: string;
  accept: string;
  displayName: string | null;
  currentUrl: string | null | undefined;
  selectedFile: File | null | undefined;
  isImage: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  const Icon = displayName && isImage ? FileImage : FilePdf;
  const iconClass =
    displayName && isImage
      ? "h-4 w-4 shrink-0 text-primary"
      : "h-4 w-4 shrink-0 text-destructive";

  return (
    <div className="space-y-2">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <input
        accept={accept}
        className="hidden"
        onChange={onChange}
        ref={inputRef}
        type="file"
      />
      {displayName ? (
        <div className="flex items-center gap-2">
          <Icon className={iconClass} />
          <span className="flex-1 truncate text-sm">{displayName}</span>
          {currentUrl && !selectedFile && (
            <Button
              onClick={() => window.open(currentUrl, "_blank")}
              size="sm"
              type="button"
              variant="outline"
            >
              Ver
            </Button>
          )}
          <Button onClick={onRemove} size="sm" type="button" variant="ghost">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          className="w-full"
          onClick={() => inputRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Upload className="mr-1.5 h-3 w-3" />
          Cargar {label.split(" ")[0].toLowerCase()}
        </Button>
      )}
    </div>
  );
}
