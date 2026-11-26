"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Controller,
  type FieldArrayWithId,
  type UseFieldArrayRemove,
  type UseFormReturn,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { normalizeCustomerTaxCondition } from "@/modules/customers/tax-conditions";
import { createMercadoLibreSaleAction } from "@/modules/mercadolibre/actions/create-mercadolibre-sale.action";
import {
  previewMeliSaleAction,
  searchMeliCustomersAction,
  searchMeliProductsAction,
} from "@/modules/mercadolibre/actions/meli-queries.action";
import type {
  MeliCatalogProduct,
  MeliCustomerChoice,
  MeliSetup,
} from "@/modules/mercadolibre/service/meli-read.service";
import {
  type CreateMeliSaleInput,
  createMeliSaleSchema,
  type ValidatedMeliSale,
} from "@/modules/mercadolibre/types";
import { defaultMeliInvoiceType } from "@/modules/mercadolibre/utils/invoice-types";
import { sumMeliMoney } from "@/modules/mercadolibre/utils/money";
import { toDateOnlyString } from "@/modules/sales/utils/date";

type Form = UseFormReturn<CreateMeliSaleInput, unknown, ValidatedMeliSale>;
const selectClass =
  "border-input bg-background h-9 w-full rounded-md border px-3 text-sm";
const NAME_SEPARATOR = /\s+/;
const NON_DIGITS = /\D/g;

function showSaleWarnings(
  fiscalWarning: string | null,
  accountingWarning: string | null
) {
  if (fiscalWarning) {
    toast.warning(
      `Venta registrada. No se completó la factura: ${fiscalWarning}`
    );
  }
  if (accountingWarning) {
    toast.warning(
      `Venta registrada. Contabilización pendiente: ${accountingWarning}`
    );
  }
}

function BuyerFields({
  form,
  orgSlug,
  invoiceTypes,
}: {
  form: Form;
  orgSlug: string;
  invoiceTypes: MeliSetup["invoiceTypes"];
}) {
  const [registered, setRegistered] = useState(false);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<MeliCustomerChoice[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const condition = form.watch("receiver.tax_condition");
  function selectCustomer(customerId: string) {
    const customer = customers.find((row) => row.id === customerId);
    if (!customer) {
      form.setValue("customerId", null);
      return;
    }
    const customerCondition = normalizeCustomerTaxCondition(
      customer.tax_condition
    );
    if (
      customerCondition !== "RESPONSABLE_INSCRIPTO" &&
      customerCondition !== "CONSUMIDOR_FINAL"
    ) {
      form.setValue("customerId", null);
      setError(
        "En Meli se admiten consumidores finales y responsables inscriptos."
      );
      return;
    }
    setError("");
    form.setValue("customerId", customer.id);
    const address = [customer.address, customer.city]
      .filter(Boolean)
      .join(", ");
    if (customerCondition === "RESPONSABLE_INSCRIPTO") {
      form.setValue("receiver", {
        version: 1,
        tax_condition: "RESPONSABLE_INSCRIPTO",
        document_type: "CUIT",
        document_number: customer.cuit ?? "",
        business_name: customer.business_name,
        address,
      });
      form.setValue(
        "invoiceType",
        defaultMeliInvoiceType(invoiceTypes, "RESPONSABLE_INSCRIPTO")
      );
    } else {
      const [firstName, ...lastName] = customer.business_name
        .trim()
        .split(NAME_SEPARATOR);
      const digits = (customer.cuit ?? "").replace(NON_DIGITS, "");
      form.setValue("receiver", {
        version: 1,
        tax_condition: "CONSUMIDOR_FINAL",
        document_type: "DNI",
        document_number: digits.length <= 8 ? digits : "",
        first_name: firstName ?? "",
        last_name: lastName.join(" "),
        address,
      });
      form.setValue(
        "invoiceType",
        defaultMeliInvoiceType(invoiceTypes, "CONSUMIDOR_FINAL")
      );
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comprador</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Label htmlFor="meli-buyer-mode">Tipo de comprador</Label>
        <select
          className={selectClass}
          id="meli-buyer-mode"
          onChange={(event) => {
            setRegistered(event.target.value === "registered");
            form.setValue("customerId", null);
          }}
          value={registered ? "registered" : "occasional"}
        >
          <option value="occasional">Comprador ocasional</option>
          <option value="registered">Cliente registrado</option>
        </select>
        {registered && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                aria-label="Buscar cliente"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nombre o CUIT"
                value={search}
              />
              <Button
                disabled={pending || search.trim().length < 2}
                onClick={() =>
                  startTransition(async () => {
                    const result = await searchMeliCustomersAction(
                      orgSlug,
                      search
                    );
                    if (result.success) {
                      setCustomers(result.data);
                      setError("");
                    } else {
                      setError(result.error);
                    }
                  })
                }
                type="button"
                variant="outline"
              >
                Buscar
              </Button>
            </div>
            <select
              aria-label="Cliente registrado"
              className={selectClass}
              onChange={(event) => selectCustomer(event.target.value)}
              required
              value={form.watch("customerId") ?? ""}
            >
              <option value="">Seleccionar cliente</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.business_name} — {customer.cuit}
                </option>
              ))}
            </select>
          </div>
        )}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="meli-condition">Condición fiscal</Label>
            <select
              className={selectClass}
              id="meli-condition"
              onChange={(event) => {
                form.setValue("customerId", null);
                setRegistered(false);
                if (event.target.value === "RESPONSABLE_INSCRIPTO") {
                  form.setValue("receiver", {
                    version: 1,
                    tax_condition: "RESPONSABLE_INSCRIPTO",
                    document_type: "CUIT",
                    document_number: "",
                    business_name: "",
                    address: "",
                  });
                  form.setValue(
                    "invoiceType",
                    defaultMeliInvoiceType(
                      invoiceTypes,
                      "RESPONSABLE_INSCRIPTO"
                    )
                  );
                } else {
                  form.setValue("receiver", {
                    version: 1,
                    tax_condition: "CONSUMIDOR_FINAL",
                    document_type: "DNI",
                    document_number: "",
                    first_name: "",
                    last_name: "",
                    address: "",
                  });
                  form.setValue(
                    "invoiceType",
                    defaultMeliInvoiceType(invoiceTypes, "CONSUMIDOR_FINAL")
                  );
                }
              }}
              value={condition}
            >
              <option value="CONSUMIDOR_FINAL">Consumidor final</option>
              <option value="RESPONSABLE_INSCRIPTO">
                Responsable inscripto
              </option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meli-document">
              {condition === "CONSUMIDOR_FINAL" ? "DNI" : "CUIT"}
            </Label>
            <Input
              id="meli-document"
              required
              {...form.register("receiver.document_number")}
            />
          </div>
          {condition === "CONSUMIDOR_FINAL" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="meli-first-name">Nombre</Label>
                <Input
                  id="meli-first-name"
                  required
                  {...form.register("receiver.first_name")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meli-last-name">Apellido</Label>
                <Input
                  id="meli-last-name"
                  required
                  {...form.register("receiver.last_name")}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="meli-business-name">Razón social</Label>
              <Input
                id="meli-business-name"
                required
                {...form.register("receiver.business_name")}
              />
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="meli-address">Dirección</Label>
            <Input
              id="meli-address"
              required
              {...form.register("receiver.address")}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Los datos quedan guardados en esta venta. No se crea ni se modifica un
          cliente permanente.
        </p>
      </CardContent>
    </Card>
  );
}

function ProductPicker({
  orgSlug,
  onAdd,
}: {
  orgSlug: string;
  onAdd: (product: MeliCatalogProduct, variantId: string | null) => void;
}) {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<MeliCatalogProduct[]>([]);
  const [variants, setVariants] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          aria-label="Buscar producto"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nombre o SKU"
          value={search}
        />
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await searchMeliProductsAction(orgSlug, search);
              if (result.success) {
                setProducts(result.data);
                setError(
                  result.data.length
                    ? ""
                    : "No hay coincidencias con stock en el depósito."
                );
              } else {
                setError(result.error);
              }
            })
          }
          type="button"
          variant="outline"
        >
          {pending ? "Buscando…" : "Buscar productos"}
        </Button>
      </div>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {products.map((product) => (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm"
          key={product.id}
        >
          <div className="min-w-40 flex-1">
            <p className="font-medium">{product.name}</p>
            <p className="text-muted-foreground">
              {product.sku} · Stock: {product.stock} {product.unit} · Precio de
              referencia: {formatCurrency(product.price)}
            </p>
          </div>
          {product.hasVariants && (
            <select
              aria-label={`Variante de ${product.name}`}
              className={`${selectClass} sm:w-56`}
              onChange={(event) =>
                setVariants((current) => ({
                  ...current,
                  [product.id]: event.target.value,
                }))
              }
              value={variants[product.id] ?? ""}
            >
              <option value="">Elegir variante</option>
              {product.variants.map((variant) => (
                <option
                  disabled={variant.stock <= 0}
                  key={variant.id}
                  value={variant.id}
                >
                  {variant.label} — {variant.stock}
                </option>
              ))}
            </select>
          )}
          <Button
            disabled={product.hasVariants && !variants[product.id]}
            onClick={() => onAdd(product, variants[product.id] ?? null)}
            size="sm"
            type="button"
            variant="outline"
          >
            Agregar
          </Button>
        </div>
      ))}
    </div>
  );
}

function Cart({
  form,
  products,
  fields,
  remove,
}: {
  form: Form;
  products: Record<string, MeliCatalogProduct>;
  fields: FieldArrayWithId<CreateMeliSaleInput, "items">[];
  remove: UseFieldArrayRemove;
}) {
  const currency = form.watch("currency");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="p-2">Producto</th>
            <th className="p-2">Cantidad</th>
            <th className="p-2">Peso/volumen</th>
            <th className="p-2">Precio unitario ({currency})</th>
            <th className="p-2">Descuento ({currency})</th>
            <th className="p-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => {
            const product = products[field.productId];
            const measured = product?.unit === "KG" || product?.unit === "LT";
            const variant = product?.variants.find(
              (row) => row.id === field.productVariantId
            );
            return (
              <tr className="border-b" key={field.id}>
                <td className="min-w-48 p-2">
                  {product?.name ?? field.productId}
                  <p className="text-muted-foreground text-xs">
                    {variant?.label}
                  </p>
                </td>
                <td className="p-2">
                  <Input
                    aria-label={`Cantidad línea ${index + 1}`}
                    className="w-24"
                    min="0.000001"
                    step="any"
                    type="number"
                    {...form.register(`items.${index}.quantity`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td className="p-2">
                  {measured ? (
                    <Input
                      aria-label={`Peso línea ${index + 1}`}
                      className="w-24"
                      min="0.000001"
                      step="any"
                      type="number"
                      {...form.register(`items.${index}.weightQuantity`, {
                        setValueAs: (value) =>
                          value === "" ? null : Number(value),
                      })}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-2">
                  <Input
                    aria-label={`Precio línea ${index + 1}`}
                    className="w-28"
                    min="0"
                    step="0.01"
                    type="number"
                    {...form.register(`items.${index}.unitPrice`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td className="p-2">
                  <Input
                    aria-label={`Descuento línea ${index + 1}`}
                    className="w-28"
                    min="0"
                    step="0.01"
                    type="number"
                    {...form.register(`items.${index}.discountAmount`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td className="p-2">
                  <Button
                    onClick={() => remove(index)}
                    type="button"
                    variant="ghost"
                  >
                    Quitar
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!fields.length && (
        <p className="py-4 text-muted-foreground">
          Agregá productos para registrar la venta.
        </p>
      )}
    </div>
  );
}

export function MeliSaleForm({
  orgSlug,
  setup,
}: {
  orgSlug: string;
  setup: MeliSetup;
}) {
  const router = useRouter();
  const [products, setProducts] = useState<Record<string, MeliCatalogProduct>>(
    {}
  );
  const [preview, setPreview] = useState<{
    values: ValidatedMeliSale;
    total: number;
    tax: number;
  } | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const form = useForm<CreateMeliSaleInput, unknown, ValidatedMeliSale>({
    resolver: zodResolver(createMeliSaleSchema),
    defaultValues: {
      orgSlug,
      warehouseId: setup.warehouse?.id ?? "",
      idempotencyKey: "",
      marketplaceOrderNumber: "",
      saleDate: "",
      customerId: null,
      receiver: {
        version: 1,
        tax_condition: "CONSUMIDOR_FINAL",
        document_type: "DNI",
        document_number: "",
        first_name: "",
        last_name: "",
        address: "",
      },
      invoiceType: defaultMeliInvoiceType(
        setup.invoiceTypes,
        "CONSUMIDOR_FINAL"
      ),
      currency: "ARS",
      commercialExchangeRate: null,
      observations: "",
      globalDiscountPercentage: 0,
      taxIds: setup.defaultTaxIds,
      items: [],
    },
  });
  const { append, fields, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const { getValues, setValue } = form;
  useEffect(() => {
    if (!getValues("idempotencyKey")) {
      setValue("idempotencyKey", crypto.randomUUID());
    }
    if (!getValues("saleDate")) {
      setValue("saleDate", toDateOnlyString(new Date()));
    }
  }, [getValues, setValue]);
  const condition = form.watch("receiver.tax_condition");
  const verify = form.handleSubmit(
    (values) =>
      startTransition(async () => {
        setError("");
        try {
          const result = await previewMeliSaleAction(values);
          if (!result.success) {
            setError(result.error);
            return;
          }
          setPreview({
            values: { ...values, expectedTotal: result.data.total },
            total: result.data.total,
            tax: sumMeliMoney(result.data.taxes.map((tax) => tax.amount)),
          });
        } catch {
          setError(
            "No se pudieron verificar los importes. Revisá la conexión y reintentá."
          );
        }
      }),
    () =>
      setError(
        "Revisá los datos del comprador, fecha, productos e importes. Todos los campos fiscales son obligatorios."
      )
  );
  function confirm() {
    if (!preview || submitting.current) {
      return;
    }
    submitting.current = true;
    setAttempted(true);
    setError("");
    startTransition(async () => {
      try {
        const result = await createMercadoLibreSaleAction(preview.values);
        if (!result.success) {
          setError(result.error);
          if (result.canEdit) {
            setAttempted(false);
            setPreview(null);
          }
          return;
        }
        showSaleWarnings(result.fiscalWarning, result.accountingWarning);
        router.push(
          `/org/${orgSlug}/venta-directa/mercado-libre/${result.data.saleId}`
        );
        router.refresh();
      } catch {
        setError(
          "No se pudo obtener la respuesta. Reintentá la misma confirmación para recuperar el resultado sin duplicar la venta."
        );
      } finally {
        submitting.current = false;
      }
    });
  }
  const confirmationLabel = attempted
    ? "Reintentar misma confirmación"
    : "Confirmar venta";
  return (
    <form className="space-y-5" onSubmit={verify}>
      {error && (
        <p
          className="rounded-md border border-destructive p-3 text-destructive text-sm"
          role="alert"
        >
          {error}
        </p>
      )}
      <fieldset className="space-y-5" disabled={pending || preview !== null}>
        <Card>
          <CardHeader>
            <CardTitle>Venta Mercado Libre</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meli-order">Número de orden Mercado Libre</Label>
              <Input
                id="meli-order"
                required
                {...form.register("marketplaceOrderNumber")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meli-date">Fecha</Label>
              <Input
                id="meli-date"
                required
                type="date"
                {...form.register("saleDate")}
              />
            </div>
            <p className="text-muted-foreground text-sm sm:col-span-2">
              Depósito: {setup.warehouse?.name}
            </p>
          </CardContent>
        </Card>
        <BuyerFields
          form={form}
          invoiceTypes={setup.invoiceTypes}
          orgSlug={orgSlug}
        />
        <Card>
          <CardHeader>
            <CardTitle>Productos y precios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProductPicker
              onAdd={(product, variantId) => {
                setProducts((current) => ({
                  ...current,
                  [product.id]: product,
                }));
                append({
                  productId: product.id,
                  productVariantId: variantId,
                  quantity: 1,
                  weightQuantity: null,
                  unitPrice: product.price,
                  discountAmount: 0,
                });
              }}
              orgSlug={orgSlug}
            />
            <Cart
              fields={fields}
              form={form}
              products={products}
              remove={remove}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Facturación e importes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meli-invoice">Comprobante</Label>
              <select
                className={selectClass}
                id="meli-invoice"
                {...form.register("invoiceType")}
              >
                {setup.invoiceTypes.includes("FACTURA_A") && (
                  <option
                    disabled={condition !== "RESPONSABLE_INSCRIPTO"}
                    value="FACTURA_A"
                  >
                    Factura A
                  </option>
                )}
                {setup.invoiceTypes.includes("FACTURA_B") && (
                  <option
                    disabled={condition === "RESPONSABLE_INSCRIPTO"}
                    value="FACTURA_B"
                  >
                    Factura B
                  </option>
                )}
                {setup.invoiceTypes.includes("FACTURA_C") && (
                  <option value="FACTURA_C">Factura C</option>
                )}
              </select>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-sm">Moneda</p>
              <p className="text-sm">ARS — precios de Venta Directa</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meli-discount">Descuento global (%)</Label>
              <Input
                id="meli-discount"
                max="100"
                min="0"
                step="0.01"
                type="number"
                {...form.register("globalDiscountPercentage", {
                  valueAsNumber: true,
                })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meli-observations">Observaciones</Label>
              <Input
                id="meli-observations"
                {...form.register("observations")}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <p className="font-medium text-sm">Impuestos de respaldo</p>
              <Controller
                control={form.control}
                name="taxIds"
                render={({ field }) => (
                  <div>
                    {setup.taxes.map((tax) => (
                      <label
                        className="mr-4 inline-flex items-center gap-2 text-sm"
                        key={tax.id}
                      >
                        <input
                          checked={(field.value ?? []).includes(tax.id)}
                          name={field.name}
                          onBlur={field.onBlur}
                          onChange={(event) =>
                            field.onChange(
                              event.target.checked
                                ? [...new Set([...(field.value ?? []), tax.id])]
                                : (field.value ?? []).filter(
                                    (id) => id !== tax.id
                                  )
                            )
                          }
                          type="checkbox"
                          value={tax.id}
                        />
                        {tax.name} {tax.rate}%
                      </label>
                    ))}
                  </div>
                )}
              />
              <p className="text-muted-foreground text-xs">
                Los impuestos configurados por producto tienen prioridad.
              </p>
            </div>
          </CardContent>
        </Card>
      </fieldset>
      {preview ? (
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p>
              Impuestos: {formatCurrency(preview.tax, preview.values.currency)}
            </p>
            <p className="font-semibold text-xl">
              Total: {formatCurrency(preview.total, preview.values.currency)}
            </p>
            <p className="text-muted-foreground text-sm">
              La confirmación registra la venta y descuenta stock. No genera
              cuenta por cobrar.
            </p>
            <div className="flex gap-3">
              <Button
                disabled={pending || attempted}
                onClick={() => setPreview(null)}
                type="button"
                variant="outline"
              >
                Volver a editar
              </Button>
              <Button disabled={pending} onClick={confirm} type="button">
                {pending ? "Confirmando…" : confirmationLabel}
              </Button>
            </div>
            {attempted && (
              <p className="text-muted-foreground text-xs">
                El reintento mantiene la misma identidad para recuperar el
                resultado sin duplicar la venta.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Button disabled={pending} type="submit">
          {pending ? "Verificando…" : "Verificar importes y stock"}
        </Button>
      )}
    </form>
  );
}
