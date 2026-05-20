"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

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
import { useSalesPriceLists } from "@/modules/sales-price-lists/hooks/use-sales-price-lists";
import { ProductSearch } from "./product-search";
import { ProductVariantsGridDialog } from "./product-variants-grid-dialog";
import { QuoteItemExtrasPopover } from "./quote-item-extras-popover";

type QuoteFormProps = {
  orgSlug: string;
  customers: Customer[];
  products: SaleProduct[];
  onSubmit: (values: QuoteFormValues) => void;
  isSubmitting?: boolean;
};

export function QuoteForm({
  orgSlug,
  customers,
  products,
  onSubmit,
  isSubmitting,
}: QuoteFormProps) {
  const { data: salesPriceLists = [] } = useSalesPriceLists(orgSlug);

  const [selectedProduct, setSelectedProduct] = useState<SaleProduct | null>(
    null
  );
  const [isGridOpen, setIsGridOpen] = useState(false);

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: {
      customerId: "",
      salesPriceListId: "",
      currency: "ARS",
      items: [],
      notes: "",
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const handleProductSelect = (product: SaleProduct) => {
    setSelectedProduct(product);
    setIsGridOpen(true);
  };

  const handleVariantsConfirm = (variants: QuoteItemVariantFormValues[]) => {
    if (!selectedProduct) {
      return;
    }

    const totalQuantity = variants.reduce((acc, v) => acc + v.quantity, 0);

    let unitPrice = selectedProduct.price || 0;

    const salesPriceListId = form.getValues("salesPriceListId");

    if (salesPriceListId) {
      const listPercentage = salesPriceLists.find(
        (pl) => pl.id === salesPriceListId
      )?.percentage;
      if (listPercentage !== undefined) {
        unitPrice = selectedProduct.price
          ? selectedProduct.price * (1 + listPercentage / 100)
          : 0;
      }
    }

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

  const formItems = useWatch({ control: form.control, name: "items" }) || [];
  const quoteTotal = formItems.reduce(
    (acc, item) => acc + (item?.subtotal || 0),
    0
  );

  const selectedPriceListId = useWatch({
    control: form.control,
    name: "salesPriceListId",
  });

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
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <Select
                        defaultValue={field.value}
                        onValueChange={field.onChange}
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
                        defaultValue={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
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
                      <Select
                        defaultValue={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione moneda" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ARS">ARS - Pesos Arg.</SelectItem>
                          <SelectItem value="USD">USD - Dólares</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                                        key={v.size}
                                      >
                                        {v.size}: {v.quantity}
                                      </span>
                                    ))}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(item.unitPrice)}
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
                                  {formatCurrency(item.subtotal)}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    onClick={() => remove(index)}
                                    size="icon"
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
                {isSubmitting ? "Guardando..." : "Crear Presupuesto"}
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
              <div className="flex items-center justify-between font-bold text-lg">
                <span>Total:</span>
                <span>{formatCurrency(quoteTotal)}</span>
              </div>
              <div className="hidden pt-4 lg:block">
                <Button
                  className="w-full"
                  disabled={isSubmitting || fields.length === 0}
                  onClick={form.handleSubmit(onSubmit)}
                  size="lg"
                >
                  {isSubmitting ? "Guardando..." : "Guardar Presupuesto"}
                </Button>
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
        product={selectedProduct}
      />
    </div>
  );
}
