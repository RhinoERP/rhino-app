"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Customer } from "@/modules/customers/types";
import { useBarcodeScannerInput } from "@/modules/pos/hooks/use-barcode-scanner-input";
import { useDirectSaleCustomers } from "@/modules/sales/hooks/use-direct-sale-customers";
import { useDirectSaleMutation } from "@/modules/sales/hooks/use-direct-sale-mutation";
import { useDirectSaleProductsSearch } from "@/modules/sales/hooks/use-direct-sale-products-search";
import { useDirectSaleTerminals } from "@/modules/sales/hooks/use-direct-sale-terminals";
import {
  type DirectSaleFormValues,
  type DirectSalePaymentMethod,
  type DirectSaleProduct,
  type DirectSaleTerminal,
  directSaleFormSchema,
} from "@/modules/sales/types";
import { toDateOnlyString } from "@/modules/sales/utils/date";
import type { Tax } from "@/modules/taxes/service/taxes.service";

type PosTerminalProps = {
  orgSlug: string;
  taxes: Tax[];
};

type CartItem = {
  lineId: string;
  product: DirectSaleProduct;
  quantity: number;
  weightQuantity: number | null;
  unitPrice: number;
  discountPercentage: number;
};

const paymentMethodOptions: {
  value: DirectSalePaymentMethod;
  label: string;
}[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta_de_credito", label: "Tarjeta de crédito" },
  { value: "tarjeta_de_debito", label: "Tarjeta de débito" },
  { value: "transferencia", label: "Transferencia" },
  { value: "cheque", label: "Cheque" },
  { value: "deposito", label: "Depósito" },
  { value: "e-cheq", label: "E-Cheq" },
];

function isWeightOrVolumeProduct(product: DirectSaleProduct) {
  return (
    product.unitOfMeasure === "KG" ||
    product.unitOfMeasure === "LT" ||
    product.unitOfMeasure === "MT"
  );
}

function resolveWeightQuantity(product: DirectSaleProduct, quantity: number) {
  if (!isWeightOrVolumeProduct(product)) {
    return null;
  }

  if (
    product.tracksStockUnits &&
    product.weightPerUnit &&
    product.weightPerUnit > 0
  ) {
    return quantity * product.weightPerUnit;
  }

  return null;
}

function getCustomerLabel(customer: Customer) {
  return (
    customer.fantasy_name || customer.business_name || "Cliente sin nombre"
  );
}

function getProductStockLabel(product: DirectSaleProduct) {
  if (product.totalUnitQuantity !== null) {
    return `${product.totalQuantity.toFixed(2)} ${product.unitOfMeasure} · ${product.totalUnitQuantity.toFixed(2)} un`;
  }

  return `${product.totalQuantity.toFixed(2)} ${product.unitOfMeasure}`;
}

function getTerminalLabel(terminal: DirectSaleTerminal) {
  if (terminal.code) {
    return `${terminal.name} (${terminal.code})`;
  }

  return terminal.name;
}

export function PosTerminal({ orgSlug, taxes }: PosTerminalProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [isOperationDataOpen, setIsOperationDataOpen] = useState(false);
  const scanFeedbackTimerRef = useRef<number | null>(null);

  const deferredSearch = useDeferredValue(searchTerm);

  const form = useForm<DirectSaleFormValues>({
    resolver: zodResolver(directSaleFormSchema),
    defaultValues: {
      terminalId: "",
      customerId: null,
      saleDate: toDateOnlyString(new Date()),
      paymentMethod: "efectivo",
      paymentReference: null,
      cardBrand: null,
      globalDiscountPercentage: 0,
      selectedTaxIds: [],
    },
  });

  const { createDirectSale } = useDirectSaleMutation(orgSlug);
  const { data: terminals = [] } = useDirectSaleTerminals(orgSlug);
  const { data: customers = [], isLoading: isLoadingCustomers } =
    useDirectSaleCustomers(orgSlug);

  const activeTerminals = useMemo(
    () => terminals.filter((terminal) => terminal.is_active !== false),
    [terminals]
  );

  const shouldSearchProducts = deferredSearch.trim().length >= 2;
  const { data: products = [], isFetching: isFetchingProducts } =
    useDirectSaleProductsSearch(
      orgSlug,
      deferredSearch,
      30,
      shouldSearchProducts
    );

  useEffect(() => {
    if (activeTerminals.length === 0) {
      return;
    }

    const currentTerminalId = form.getValues("terminalId");
    const isCurrentTerminalActive = activeTerminals.some(
      (terminal) => terminal.id === currentTerminalId
    );

    if (!isCurrentTerminalActive) {
      form.setValue("terminalId", activeTerminals[0].id, {
        shouldValidate: true,
      });
    }
  }, [activeTerminals, form]);

  const selectedTaxIds = form.watch("selectedTaxIds");
  const globalDiscountPercentage = Number(
    form.watch("globalDiscountPercentage") ?? 0
  );
  const paymentMethod = form.watch("paymentMethod");
  const selectedTerminalId = form.watch("terminalId");
  const selectedCustomerId = form.watch("customerId");

  const selectedTerminalLabel = useMemo(() => {
    const selected = activeTerminals.find(
      (terminal) => terminal.id === selectedTerminalId
    );
    return selected ? getTerminalLabel(selected) : "Sin terminal";
  }, [activeTerminals, selectedTerminalId]);

  const selectedCustomerLabel = useMemo(() => {
    if (!selectedCustomerId) {
      return "Consumidor final";
    }

    const selected = customers.find(
      (customer) => customer.id === selectedCustomerId
    );
    return selected ? getCustomerLabel(selected) : "Consumidor final";
  }, [customers, selectedCustomerId]);

  const selectedTaxes = useMemo(
    () => taxes.filter((tax) => selectedTaxIds.includes(tax.id)),
    [selectedTaxIds, taxes]
  );

  const cartSummary = useMemo(() => {
    const subtotal = cartItems.reduce((sum, item) => {
      const effectiveQuantity = item.weightQuantity ?? item.quantity;
      const gross = effectiveQuantity * item.unitPrice;
      const discount = Math.min(
        Math.max(0, (item.discountPercentage / 100) * gross),
        Math.max(0, gross)
      );

      return sum + Math.max(0, gross - discount);
    }, 0);

    const lineDiscountAmount = cartItems.reduce((sum, item) => {
      const effectiveQuantity = item.weightQuantity ?? item.quantity;
      const gross = effectiveQuantity * item.unitPrice;
      const discount = Math.min(
        Math.max(0, (item.discountPercentage / 100) * gross),
        Math.max(0, gross)
      );
      return sum + discount;
    }, 0);

    const safeGlobalDiscountPercentage = Math.min(
      Math.max(0, globalDiscountPercentage),
      100
    );

    const globalDiscountAmount =
      (safeGlobalDiscountPercentage / 100) * subtotal;
    const subtotalAfterDiscount = Math.max(0, subtotal - globalDiscountAmount);

    const totalTaxAmount = selectedTaxes.reduce(
      (sum, tax) => sum + subtotalAfterDiscount * (tax.rate / 100),
      0
    );

    return {
      subtotal,
      lineDiscountAmount,
      globalDiscountAmount,
      totalTaxAmount,
      totalDiscount: lineDiscountAmount + globalDiscountAmount,
      total: subtotalAfterDiscount + totalTaxAmount,
    };
  }, [cartItems, globalDiscountPercentage, selectedTaxes]);

  const addProductToCart = useCallback((product: DirectSaleProduct) => {
    setCartItems((previous) => {
      const existing = previous.find((item) => item.product.id === product.id);

      if (existing) {
        return previous.map((item) => {
          if (item.product.id !== product.id) {
            return item;
          }

          const nextQuantity = item.quantity + 1;

          return {
            ...item,
            quantity: nextQuantity,
            weightQuantity: resolveWeightQuantity(item.product, nextQuantity),
          };
        });
      }

      const quantity = 1;

      return [
        ...previous,
        {
          lineId: `${product.id}-${Date.now()}`,
          product,
          quantity,
          weightQuantity: resolveWeightQuantity(product, quantity),
          unitPrice: product.price,
          discountPercentage: 0,
        },
      ];
    });

    setErrorMessage(null);
  }, []);

  const playScanErrorBeep = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const audioContext = new window.AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      const startAt = audioContext.currentTime;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, startAt);

      gainNode.gain.setValueAtTime(0.001, startAt);
      gainNode.gain.exponentialRampToValueAtTime(0.08, startAt + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startAt + 0.12);

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + 0.12);
      oscillator.onended = () => {
        audioContext.close().catch(() => null);
      };
    } catch {
      // Ignore audio feedback errors (e.g., browser policies).
    }
  }, []);

  const showScanFeedback = useCallback((message: string) => {
    setScanFeedback(message);

    if (scanFeedbackTimerRef.current !== null) {
      window.clearTimeout(scanFeedbackTimerRef.current);
    }

    scanFeedbackTimerRef.current = window.setTimeout(() => {
      setScanFeedback(null);
      scanFeedbackTimerRef.current = null;
    }, 2200);
  }, []);

  useEffect(
    () => () => {
      if (scanFeedbackTimerRef.current !== null) {
        window.clearTimeout(scanFeedbackTimerRef.current);
      }
    },
    []
  );

  const handleBarcodeScanned = useCallback(
    async (barcode: string) => {
      setScanFeedback(null);

      try {
        const urlParams = new URLSearchParams();
        urlParams.set("barcode", barcode);
        urlParams.set("limit", "1");

        const response = await fetch(
          `/api/org/${orgSlug}/venta-directa/productos?${urlParams.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          const message =
            payload &&
            typeof payload === "object" &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "No se pudo buscar el producto por código de barras.";

          setErrorMessage(message);
          showScanFeedback("Error de lectura o búsqueda del código.");
          playScanErrorBeep();
          return;
        }

        const productsFromBarcode = Array.isArray(payload)
          ? (payload as DirectSaleProduct[])
          : [];

        const product = productsFromBarcode[0];

        if (!product) {
          setErrorMessage(
            `No se encontró un producto con el código de barras "${barcode}".`
          );
          showScanFeedback("Código no encontrado.");
          playScanErrorBeep();
          return;
        }

        addProductToCart(product);
        setErrorMessage(null);
        setScanFeedback(null);
      } catch {
        setErrorMessage(
          "No se pudo procesar el escaneo. Verifica conexión e intenta nuevamente."
        );
        showScanFeedback("Error de lectura o búsqueda del código.");
        playScanErrorBeep();
      }
    },
    [addProductToCart, orgSlug, playScanErrorBeep, showScanFeedback]
  );

  const {
    searchInputRef,
    handleSearchInputKeyDown,
    isScanning: isScanningBarcode,
  } = useBarcodeScannerInput({
    searchValue: searchTerm,
    setSearchValue: setSearchTerm,
    onBarcodeScanned: handleBarcodeScanned,
    onScanError: () => {
      setErrorMessage(
        "No se pudo procesar el escaneo. Intenta escanear nuevamente."
      );
      showScanFeedback("Error de lectura o búsqueda del código.");
      playScanErrorBeep();
    },
  });

  const updateCartQuantity = (lineId: string, nextQuantity: number) => {
    setCartItems((previous) =>
      previous
        .map((item) => {
          if (item.lineId !== lineId) {
            return item;
          }

          const safeQuantity = Number.isFinite(nextQuantity)
            ? Math.max(0, nextQuantity)
            : 0;

          return {
            ...item,
            quantity: safeQuantity,
            weightQuantity: resolveWeightQuantity(item.product, safeQuantity),
          };
        })
        .filter((item) => item.quantity > 0)
    );
  };

  const updateCartUnitPrice = (lineId: string, nextUnitPrice: number) => {
    setCartItems((previous) =>
      previous.map((item) => {
        if (item.lineId !== lineId) {
          return item;
        }

        return {
          ...item,
          unitPrice: Number.isFinite(nextUnitPrice)
            ? Math.max(0, nextUnitPrice)
            : 0,
        };
      })
    );
  };

  const updateCartDiscount = (lineId: string, nextDiscount: number) => {
    setCartItems((previous) =>
      previous.map((item) => {
        if (item.lineId !== lineId) {
          return item;
        }

        return {
          ...item,
          discountPercentage: Number.isFinite(nextDiscount)
            ? Math.min(Math.max(0, nextDiscount), 100)
            : 0,
        };
      })
    );
  };

  const removeCartItem = (lineId: string) => {
    setCartItems((previous) =>
      previous.filter((item) => item.lineId !== lineId)
    );
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (activeTerminals.length === 0) {
      setErrorMessage(
        "No hay terminales POS activas. Activa una terminal desde Configuración."
      );
      return;
    }

    if (!cartItems.length) {
      setErrorMessage(
        "Agrega al menos un producto para registrar la venta directa."
      );
      return;
    }

    setErrorMessage(null);

    try {
      const taxesPayload = selectedTaxes.map((tax) => ({
        taxId: tax.id,
        name: tax.name,
        rate: tax.rate,
      }));

      await createDirectSale.mutateAsync({
        terminalId: values.terminalId,
        customerId: values.customerId ?? null,
        saleDate: values.saleDate,
        paymentMethod: values.paymentMethod,
        paymentReference: values.paymentReference ?? null,
        cardBrand: values.cardBrand ?? null,
        globalDiscountPercentage: values.globalDiscountPercentage,
        items: cartItems.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          weightQuantity: item.weightQuantity,
          unitPrice: item.unitPrice,
          discountPercentage: item.discountPercentage,
        })),
        taxes: taxesPayload.length ? taxesPayload : undefined,
      });

      router.push(`/org/${orgSlug}/venta-directa`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la venta directa."
      );
    }
  });

  const isSubmitting = createDirectSale.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href={`/org/${orgSlug}/venta-directa`}>
          <Button size="sm" variant="ghost">
            <ArrowLeft className="h-4 w-4" />
            Volver a Venta Directa
          </Button>
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="font-heading text-3xl">Nueva venta directa</h1>
        <p className="text-muted-foreground">
          Flujo de caja retail: busca, agrega al carrito y cobra al instante.
        </p>
      </div>

      <Form {...form}>
        <form
          className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
          onSubmit={onSubmit}
        >
          <div className="space-y-6">
            <Card>
              <CardHeader className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="font-heading text-2xl">
                      Carrito de compras
                    </CardTitle>
                    <CardDescription>
                      Busca por nombre o SKU y agrega productos en tiempo real.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">
                    {cartItems.length}{" "}
                    {cartItems.length === 1 ? "ítem" : "ítems"}
                  </Badge>
                </div>

                <div className="relative">
                  <Search className="absolute top-3.5 left-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="h-11 pl-9"
                    disabled={isScanningBarcode}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    onKeyDown={handleSearchInputKeyDown}
                    placeholder="Buscar por nombre/SKU o escanear código de barras"
                    ref={searchInputRef}
                    value={searchTerm}
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  Escáner USB/HID: escaneá con foco en este campo y Enter agrega
                  +1 al carrito.
                </p>
                {scanFeedback && (
                  <p className="text-destructive text-xs">{scanFeedback}</p>
                )}
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    Resultados
                  </p>
                  <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
                    {shouldSearchProducts ? (
                      <>
                        {products.map((product) => {
                          const hasStock = product.totalQuantity > 0;

                          return (
                            <div
                              className={cn(
                                "flex items-center justify-between rounded-md border p-3",
                                !hasStock && "bg-muted/30"
                              )}
                              key={product.id}
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium text-sm">
                                  {product.name}
                                </p>
                                <p className="truncate text-muted-foreground text-xs">
                                  SKU {product.sku} ·{" "}
                                  {formatCurrency(product.price)} ·{" "}
                                  {getProductStockLabel(product)}
                                </p>
                              </div>
                              <Button
                                className="ml-3"
                                disabled={!hasStock}
                                onClick={() => addProductToCart(product)}
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                <Plus className="mr-1 h-4 w-4" />
                                {hasStock ? "Agregar" : "Sin stock"}
                              </Button>
                            </div>
                          );
                        })}

                        {!products.length && (
                          <p className="text-muted-foreground text-sm">
                            {isFetchingProducts
                              ? "Buscando productos..."
                              : "No se encontraron productos para esta búsqueda."}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        Escribe al menos 2 caracteres para buscar productos.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="font-medium text-sm">Productos en carrito</p>

                  {!cartItems.length && (
                    <p className="rounded-md border border-dashed p-4 text-muted-foreground text-sm">
                      No hay productos en el carrito.
                    </p>
                  )}

                  {cartItems.map((item) => {
                    const effectiveQuantity =
                      item.weightQuantity ?? item.quantity;
                    const gross = effectiveQuantity * item.unitPrice;
                    const discount = Math.min(
                      Math.max(0, (item.discountPercentage / 100) * gross),
                      Math.max(0, gross)
                    );
                    const subtotal = Math.max(0, gross - discount);

                    return (
                      <div className="rounded-md border p-3" key={item.lineId}>
                        <div className="mb-2 flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-sm">
                              {item.product.name}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              SKU {item.product.sku} · Stock{" "}
                              {getProductStockLabel(item.product)}
                            </p>
                            {item.weightQuantity !== null && (
                              <Badge className="mt-1" variant="outline">
                                {item.weightQuantity.toFixed(2)}{" "}
                                {item.product.unitOfMeasure}
                              </Badge>
                            )}
                          </div>
                          <Button
                            onClick={() => removeCartItem(item.lineId)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-4">
                          <div>
                            <p className="mb-1 text-muted-foreground text-xs">
                              Cantidad
                            </p>
                            <Input
                              inputMode="decimal"
                              min={0}
                              onChange={(event) =>
                                updateCartQuantity(
                                  item.lineId,
                                  Number(event.target.value)
                                )
                              }
                              step="0.01"
                              type="number"
                              value={item.quantity}
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-muted-foreground text-xs">
                              Precio unitario
                            </p>
                            <Input
                              inputMode="decimal"
                              min={0}
                              onChange={(event) =>
                                updateCartUnitPrice(
                                  item.lineId,
                                  Number(event.target.value)
                                )
                              }
                              step="0.01"
                              type="number"
                              value={item.unitPrice}
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-muted-foreground text-xs">
                              Descuento %
                            </p>
                            <Input
                              inputMode="decimal"
                              max={100}
                              min={0}
                              onChange={(event) =>
                                updateCartDiscount(
                                  item.lineId,
                                  Number(event.target.value)
                                )
                              }
                              step="0.01"
                              type="number"
                              value={item.discountPercentage}
                            />
                          </div>
                          <div className="flex flex-col justify-end">
                            <p className="text-muted-foreground text-xs">
                              Subtotal
                            </p>
                            <p className="font-semibold text-sm">
                              {formatCurrency(subtotal)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle>Resumen</CardTitle>
                <CardDescription>
                  Total actualizado en tiempo real.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(cartSummary.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Descuentos</span>
                  <span>-{formatCurrency(cartSummary.totalDiscount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Impuestos</span>
                  <span>{formatCurrency(cartSummary.totalTaxAmount)}</span>
                </div>
                <div className="flex items-center justify-between border-t pt-2 font-semibold text-base">
                  <span>Total</span>
                  <span>{formatCurrency(cartSummary.total)}</span>
                </div>

                {errorMessage && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                    {errorMessage}
                  </div>
                )}

                <Button
                  className="w-full"
                  disabled={isSubmitting || cartItems.length === 0}
                  type="submit"
                >
                  {isSubmitting ? "Registrando venta..." : "Registrar venta"}
                </Button>
              </CardContent>
            </Card>

            <Collapsible
              onOpenChange={setIsOperationDataOpen}
              open={isOperationDataOpen}
            >
              <Card>
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle>Datos de la operación</CardTitle>
                      <CardDescription>
                        Panel compacto de terminal, cliente y pago.
                      </CardDescription>
                    </div>
                    <CollapsibleTrigger asChild>
                      <Button size="sm" type="button" variant="outline">
                        Editar
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isOperationDataOpen && "rotate-180"
                          )}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  </div>

                  <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Terminal</span>
                      <span className="max-w-[180px] truncate text-right font-medium">
                        {selectedTerminalLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Cliente</span>
                      <span className="max-w-[180px] truncate text-right font-medium">
                        {selectedCustomerLabel}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Pago</span>
                      <span className="font-medium">
                        {
                          paymentMethodOptions.find(
                            (option) => option.value === paymentMethod
                          )?.label
                        }
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CollapsibleContent>
                  <CardContent className="grid gap-4 pt-0">
                    <FormField
                      control={form.control}
                      name="terminalId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Terminal</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || ""}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecciona una terminal" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {activeTerminals.map((terminal) => (
                                <SelectItem
                                  key={terminal.id}
                                  value={terminal.id}
                                >
                                  {getTerminalLabel(terminal)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {activeTerminals.length === 0 ? (
                            <p className="text-destructive text-xs">
                              No hay terminales activas. Crea una en
                              Configuración → Terminales POS.
                            </p>
                          ) : null}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="customerId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cliente</FormLabel>
                          <Select
                            onValueChange={(value) =>
                              field.onChange(
                                value === "__consumer__" ? null : value
                              )
                            }
                            value={field.value ?? "__consumer__"}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Consumidor final" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__consumer__">
                                Consumidor final
                              </SelectItem>
                              {customers.map((customer) => (
                                <SelectItem
                                  key={customer.id}
                                  value={customer.id}
                                >
                                  {getCustomerLabel(customer)}
                                </SelectItem>
                              ))}
                              {isLoadingCustomers ? (
                                <SelectItem
                                  disabled
                                  value="__loading_customers__"
                                >
                                  Cargando clientes...
                                </SelectItem>
                              ) : null}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="paymentMethod"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Método de pago</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Método de pago" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {paymentMethodOptions.map((option) => (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="saleDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha de venta</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="globalDiscountPercentage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Descuento global (%)</FormLabel>
                            <FormControl>
                              <Input
                                inputMode="decimal"
                                max={100}
                                min={0}
                                onChange={(event) =>
                                  field.onChange(Number(event.target.value))
                                }
                                step="0.01"
                                type="number"
                                value={field.value ?? 0}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="paymentReference"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Referencia de pago</FormLabel>
                            <FormControl>
                              <Input
                                onChange={(event) =>
                                  field.onChange(event.target.value || null)
                                }
                                placeholder="Nro. operación / ticket"
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="cardBrand"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Marca de tarjeta</FormLabel>
                            <FormControl>
                              <Input
                                disabled={
                                  paymentMethod !== "tarjeta_de_credito" &&
                                  paymentMethod !== "tarjeta_de_debito"
                                }
                                onChange={(event) =>
                                  field.onChange(event.target.value || null)
                                }
                                placeholder="Visa, Mastercard, ..."
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {taxes.length > 0 ? (
                      <FormField
                        control={form.control}
                        name="selectedTaxIds"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Impuestos</FormLabel>
                            <Select
                              onValueChange={(value) =>
                                field.onChange(
                                  value === "__none__" ? [] : [value]
                                )
                              }
                              value={field.value[0] ?? "__none__"}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Selecciona un impuesto" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="__none__">
                                  Sin impuestos
                                </SelectItem>
                                {taxes.map((tax) => (
                                  <SelectItem key={tax.id} value={tax.id}>
                                    {tax.name} ({tax.rate}%)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : null}
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>
        </form>
      </Form>
    </div>
  );
}
