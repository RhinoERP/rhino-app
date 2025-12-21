"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarIcon,
  Check,
  ChevronsUpDown,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { cn } from "@/lib/utils";
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI form composition requires several hooks and handlers
export function PreSaleForm({
  orgSlug,
  customers,
  sellers,
  products,
}: PreSaleFormProps) {
  const [customerId, setCustomerId] = useState<string>("");
  const [sellerId, setSellerId] = useState<string>("");
  const [saleDate, setSaleDate] = useState<Date>(new Date());
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("NOTA_DE_VENTA");
  const [observations, setObservations] = useState<string>("");

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);
  const [selectedPrice, setSelectedPrice] = useState<number>(0);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<string>("");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [isSupplierFilterOpen, setIsSupplierFilterOpen] = useState(false);
  const [isBrandFilterOpen, setIsBrandFilterOpen] = useState(false);
  const [isCategoryFilterOpen, setIsCategoryFilterOpen] = useState(false);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [isSellerPickerOpen, setIsSellerPickerOpen] = useState(false);

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

  const supplierOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const product of products) {
      if (product.supplierId && product.supplierName) {
        options.set(product.supplierId, product.supplierName);
      }
    }

    return Array.from(options.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const categoryOptions = useMemo(() => {
    const options = new Map<string, string>();

    for (const product of products) {
      if (product.categoryId && product.categoryName) {
        options.set(product.categoryId, product.categoryName);
      }
    }

    return Array.from(options.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products]);

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();

    for (const product of products) {
      const brand = product.brand?.trim();
      if (brand) {
        brands.add(brand);
      }
    }

    return Array.from(brands).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) => {
        const normalizedBrand = product.brand?.trim() ?? "";

        if (supplierFilter && product.supplierId !== supplierFilter) {
          return false;
        }

        if (brandFilter && normalizedBrand !== brandFilter) {
          return false;
        }

        if (categoryFilter && product.categoryId !== categoryFilter) {
          return false;
        }

        return true;
      }),
    [brandFilter, categoryFilter, products, supplierFilter]
  );

  const supplierFilterLabel = useMemo(() => {
    if (!supplierFilter) {
      return "Todos";
    }
    return supplierOptions.find((option) => option.id === supplierFilter)
      ?.label;
  }, [supplierFilter, supplierOptions]);

  const brandFilterLabel = useMemo(() => {
    if (!brandFilter) {
      return "Todas";
    }
    return brandOptions.find((brand) => brand === brandFilter) ?? "Todas";
  }, [brandFilter, brandOptions]);

  const categoryFilterLabel = useMemo(() => {
    if (!categoryFilter) {
      return "Todas";
    }
    return categoryOptions.find((option) => option.id === categoryFilter)
      ?.label;
  }, [categoryFilter, categoryOptions]);

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

  const saleDateString = useMemo(() => toDateOnlyString(saleDate), [saleDate]);
  const expirationDateString = useMemo(
    () => (expirationDate ? toDateOnlyString(expirationDate) : ""),
    [expirationDate]
  );

  const dueDate = useMemo(
    () => computeDueDate(saleDateString, expirationDateString || null),
    [saleDateString, expirationDateString]
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

  const handleUpdateItemQuantity = (productId: string, quantity: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity } : item
      )
    );
  };

  const handleQuantityInputChange = (productId: string, value: string) => {
    const parsed = Number.parseFloat(value);
    const nextQuantity = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;

    handleUpdateItemQuantity(productId, nextQuantity);
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
        saleDate: saleDateString,
        expirationDate: expirationDateString || null,
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
  const selectedCustomer = customers.find(
    (customer) => customer.id === customerId
  );
  const selectedSeller = sellerOptions.find((seller) => seller.id === sellerId);

  const handleCustomerSelect = (id: string) => {
    setCustomerId(id);
    setIsCustomerPickerOpen(false);
  };

  const handleSellerSelect = (id: string) => {
    setSellerId(id);
    setIsSellerPickerOpen(false);
  };

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
                  <Popover
                    onOpenChange={setIsCustomerPickerOpen}
                    open={isCustomerPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isCustomerPickerOpen}
                        className="w-full justify-between text-left font-normal"
                        id="customer"
                        role="combobox"
                        variant="outline"
                      >
                        <span className="truncate">
                          {selectedCustomer
                            ? selectedCustomer.fantasy_name ||
                              selectedCustomer.business_name
                            : "Selecciona un cliente"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[320px] max-w-[90vw] p-0"
                      sideOffset={8}
                    >
                      <Command>
                        <CommandInput placeholder="Buscar cliente..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {customers.map((customer) => {
                              const label =
                                customer.fantasy_name ||
                                customer.business_name ||
                                "Cliente sin nombre";
                              return (
                                <CommandItem
                                  key={customer.id}
                                  onSelect={() =>
                                    handleCustomerSelect(customer.id)
                                  }
                                  value={label}
                                >
                                  <span className="flex-1 truncate">
                                    {label}
                                  </span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      customerId === customer.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-muted-foreground text-xs">
                    Selecciona el cliente de esta preventa.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="seller">Vendedor *</Label>
                  <Popover
                    onOpenChange={setIsSellerPickerOpen}
                    open={isSellerPickerOpen}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        aria-expanded={isSellerPickerOpen}
                        className="w-full justify-between text-left font-normal"
                        id="seller"
                        role="combobox"
                        variant="outline"
                      >
                        <span className="truncate">
                          {selectedSeller
                            ? selectedSeller.label
                            : "Selecciona un vendedor"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-[320px] max-w-[90vw] p-0"
                      sideOffset={8}
                    >
                      <Command>
                        <CommandInput placeholder="Buscar vendedor..." />
                        <CommandList>
                          <CommandEmpty>Sin resultados.</CommandEmpty>
                          <CommandGroup>
                            {sellerOptions.map((seller) => (
                              <CommandItem
                                key={seller.id}
                                onSelect={() => handleSellerSelect(seller.id)}
                                value={seller.label}
                              >
                                <span className="flex-1 truncate">
                                  {seller.label}
                                </span>
                                <Check
                                  className={cn(
                                    "h-4 w-4 shrink-0 text-primary transition-opacity",
                                    sellerId === seller.id
                                      ? "opacity-100"
                                      : "opacity-0"
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-muted-foreground text-xs">
                    Usamos los usuarios de la organización como vendedores.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="saleDate">Fecha de venta *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !saleDate && "text-muted-foreground"
                        )}
                        id="saleDate"
                        variant="outline"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {saleDate ? (
                          format(saleDate, "PPP", { locale: es })
                        ) : (
                          <span>Seleccione una fecha</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        initialFocus
                        locale={es}
                        mode="single"
                        onSelect={(date) => setSaleDate(date ?? new Date())}
                        selected={saleDate}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expirationDate">Fecha de vencimiento</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !expirationDate && "text-muted-foreground"
                        )}
                        id="expirationDate"
                        variant="outline"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {expirationDate ? (
                          format(expirationDate, "PPP", { locale: es })
                        ) : (
                          <span>Seleccione una fecha</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-0">
                      <Calendar
                        disabled={(date) =>
                          saleDate ? date < saleDate : false
                        }
                        initialFocus
                        locale={es}
                        mode="single"
                        onSelect={(date) => setExpirationDate(date ?? null)}
                        selected={expirationDate ?? undefined}
                      />
                    </PopoverContent>
                  </Popover>
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
              <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="supplierFilter">Proveedor</Label>
                    <Popover
                      onOpenChange={setIsSupplierFilterOpen}
                      open={isSupplierFilterOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          aria-expanded={isSupplierFilterOpen}
                          className="w-full justify-between text-left font-normal"
                          id="supplierFilter"
                          role="combobox"
                          variant="outline"
                        >
                          <span className="truncate">
                            {supplierFilterLabel || "Todos"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[280px] max-w-[90vw] p-0"
                        sideOffset={8}
                      >
                        <Command>
                          <CommandInput placeholder="Buscar proveedor..." />
                          <CommandList>
                            <CommandEmpty>Sin resultados.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                key="all"
                                onSelect={() => {
                                  setSupplierFilter("");
                                  setIsSupplierFilterOpen(false);
                                }}
                                value="Todos"
                              >
                                <span className="flex-1 truncate">Todos</span>
                                <Check
                                  className={cn(
                                    "h-4 w-4 shrink-0 text-primary transition-opacity",
                                    supplierFilter ? "opacity-0" : "opacity-100"
                                  )}
                                />
                              </CommandItem>
                              {supplierOptions.map((supplier) => (
                                <CommandItem
                                  key={supplier.id}
                                  onSelect={() => {
                                    setSupplierFilter(supplier.id);
                                    setIsSupplierFilterOpen(false);
                                  }}
                                  value={supplier.label}
                                >
                                  <span className="flex-1 truncate">
                                    {supplier.label}
                                  </span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      supplierFilter === supplier.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="brandFilter">Marca</Label>
                    <Popover
                      onOpenChange={setIsBrandFilterOpen}
                      open={isBrandFilterOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          aria-expanded={isBrandFilterOpen}
                          className="w-full justify-between text-left font-normal"
                          id="brandFilter"
                          role="combobox"
                          variant="outline"
                        >
                          <span className="truncate">
                            {brandFilterLabel || "Todas"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[280px] max-w-[90vw] p-0"
                        sideOffset={8}
                      >
                        <Command>
                          <CommandInput placeholder="Buscar marca..." />
                          <CommandList>
                            <CommandEmpty>Sin resultados.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                key="all"
                                onSelect={() => {
                                  setBrandFilter("");
                                  setIsBrandFilterOpen(false);
                                }}
                                value="Todas"
                              >
                                <span className="flex-1 truncate">Todas</span>
                                <Check
                                  className={cn(
                                    "h-4 w-4 shrink-0 text-primary transition-opacity",
                                    brandFilter ? "opacity-0" : "opacity-100"
                                  )}
                                />
                              </CommandItem>
                              {brandOptions.map((brand) => (
                                <CommandItem
                                  key={brand}
                                  onSelect={() => {
                                    setBrandFilter(brand);
                                    setIsBrandFilterOpen(false);
                                  }}
                                  value={brand}
                                >
                                  <span className="flex-1 truncate">
                                    {brand}
                                  </span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      brandFilter === brand
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="categoryFilter">Categoría</Label>
                    <Popover
                      onOpenChange={setIsCategoryFilterOpen}
                      open={isCategoryFilterOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          aria-expanded={isCategoryFilterOpen}
                          className="w-full justify-between text-left font-normal"
                          id="categoryFilter"
                          role="combobox"
                          variant="outline"
                        >
                          <span className="truncate">
                            {categoryFilterLabel || "Todas"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[280px] max-w-[90vw] p-0"
                        sideOffset={8}
                      >
                        <Command>
                          <CommandInput placeholder="Buscar categoría..." />
                          <CommandList>
                            <CommandEmpty>Sin resultados.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                key="all"
                                onSelect={() => {
                                  setCategoryFilter("");
                                  setIsCategoryFilterOpen(false);
                                }}
                                value="Todas"
                              >
                                <span className="flex-1 truncate">Todas</span>
                                <Check
                                  className={cn(
                                    "h-4 w-4 shrink-0 text-primary transition-opacity",
                                    categoryFilter ? "opacity-0" : "opacity-100"
                                  )}
                                />
                              </CommandItem>
                              {categoryOptions.map((category) => (
                                <CommandItem
                                  key={category.id}
                                  onSelect={() => {
                                    setCategoryFilter(category.id);
                                    setIsCategoryFilterOpen(false);
                                  }}
                                  value={category.label}
                                >
                                  <span className="flex-1 truncate">
                                    {category.label}
                                  </span>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0 text-primary transition-opacity",
                                      categoryFilter === category.id
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,_2fr)_140px_auto] items-end gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="product">Producto</Label>
                    <Popover
                      onOpenChange={setIsProductPickerOpen}
                      open={isProductPickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          aria-expanded={isProductPickerOpen}
                          className="w-full justify-between text-left font-normal"
                          id="product"
                          role="combobox"
                          variant="outline"
                        >
                          {selectedProduct ? (
                            <div className="flex flex-1 flex-col text-left leading-tight">
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
                            <span className="text-muted-foreground">
                              Selecciona un producto
                            </span>
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-[520px] max-w-[90vw] p-0"
                        sideOffset={8}
                      >
                        <Command>
                          <CommandInput placeholder="Buscar producto por nombre o SKU..." />
                          <CommandList>
                            <CommandEmpty>
                              No se encontraron productos para los filtros
                              aplicados.
                            </CommandEmpty>
                            <CommandGroup>
                              {filteredProducts.map((product) => {
                                const averageLabel =
                                  product.tracksStockUnits &&
                                  isWeightOrVolumeUnit(product.unitOfMeasure)
                                    ? formatAveragePerUnit(
                                        product.averageQuantityPerUnit,
                                        product.unitOfMeasure
                                      )
                                    : null;
                                const appliedPrice =
                                  resolveAppliedUnitPrice(product);

                                return (
                                  <CommandItem
                                    key={product.id}
                                    onSelect={() => {
                                      setSelectedProductId(product.id);
                                      setIsProductPickerOpen(false);
                                    }}
                                    value={`${product.name} ${product.sku} ${product.brand ?? ""} ${product.supplierName ?? ""} ${product.categoryName ?? ""}`}
                                  >
                                    <div className="flex w-full items-start gap-3">
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">
                                          {product.name}
                                        </p>
                                        <p className="text-muted-foreground text-xs">
                                          {product.sku} ·{" "}
                                          {formatPriceByMeasure(
                                            product.price,
                                            product.unitOfMeasure
                                          )}
                                        </p>
                                        {averageLabel ? (
                                          <p className="text-[11px] text-muted-foreground">
                                            Prom: {averageLabel} · Precio
                                            aplicado:{" "}
                                            {formatCurrency(appliedPrice)} x
                                            unidad
                                          </p>
                                        ) : null}
                                      </div>
                                      <Check
                                        className={cn(
                                          "h-4 w-4 shrink-0 text-primary transition-opacity",
                                          selectedProductId === product.id
                                            ? "opacity-100"
                                            : "opacity-0"
                                        )}
                                      />
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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
                    {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: render logic for item rows */}
                    {items.map((item) => {
                      const averageLabel = formatAveragePerUnit(
                        item.averageQuantityPerUnit,
                        item.unitOfMeasure
                      );
                      const isWeightTracked =
                        item.tracksStockUnits &&
                        isWeightOrVolumeUnit(item.unitOfMeasure);
                      const shouldShowPriceDetail =
                        isWeightTracked || item.unitOfMeasure !== "UN";
                      const appliedPriceLabel = formatCurrency(item.unitPrice);
                      const basePriceLabel = formatPriceByMeasure(
                        item.basePrice,
                        item.unitOfMeasure
                      );
                      let priceDetail: string | null = null;

                      if (shouldShowPriceDetail) {
                        if (isWeightTracked) {
                          const averagePrefix = averageLabel
                            ? `Prom: ${averageLabel} · `
                            : "";
                          priceDetail = `${averagePrefix}Precio aplicado: ${appliedPriceLabel} x unidad`;
                        } else {
                          priceDetail = `Precio: ${appliedPriceLabel} x unidad`;
                        }
                      }

                      return (
                        <div
                          className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,_2fr)_140px_140px_auto] sm:items-center"
                          key={item.productId}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">{item.name}</p>
                              {item.brand ? (
                                <span className="text-muted-foreground text-xs">
                                  {item.brand}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-muted-foreground text-sm">
                              {item.sku} · {basePriceLabel}
                            </p>
                            {priceDetail ? (
                              <p className="text-muted-foreground text-xs">
                                {priceDetail}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-col gap-1">
                            <span className="text-muted-foreground text-xs">
                              Cantidad
                            </span>
                            <Input
                              className="h-8 w-full"
                              inputMode="decimal"
                              min={0}
                              onChange={(event) =>
                                handleQuantityInputChange(
                                  item.productId,
                                  event.target.value
                                )
                              }
                              step="0.01"
                              type="number"
                              value={
                                Number.isNaN(item.quantity) ? "" : item.quantity
                              }
                            />
                          </div>

                          <div className="flex flex-col items-start gap-1 sm:items-end">
                            <span className="text-muted-foreground text-xs">
                              Subtotal
                            </span>
                            <p className="font-medium">
                              {formatCurrency(item.quantity * item.unitPrice)}
                            </p>
                          </div>

                          <div className="flex items-center justify-start sm:justify-end">
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
