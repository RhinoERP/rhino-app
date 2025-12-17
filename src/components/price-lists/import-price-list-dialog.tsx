"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarIcon, Plus, WarningCircle } from "@phosphor-icons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { importPriceListAction } from "@/modules/price-lists/actions/import-price-list.action";
import type { ImportPriceListItem } from "@/modules/price-lists/types";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";

// Excel column regex patterns (moved to top-level for performance)
const SKU_COLUMN_REGEX = /^sku$/i;
const PRICE_COLUMN_REGEX = /^(precio|price)$/i;

const priceListSchema = z.object({
  supplier_id: z.string().min(1, "El proveedor es obligatorio"),
  name: z.string().min(1, "El nombre de la lista es obligatorio"),
  valid_from: z.date({
    message: "La fecha de vigencia es obligatoria",
  }),
  file: z
    .any()
    .refine((files) => files && files.length > 0, "El archivo es obligatorio")
    .refine(
      (files) =>
        files?.[0] &&
        (files[0].type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
          files[0].type === "application/vnd.ms-excel"),
      "El archivo debe ser un archivo Excel (.xlsx o .xls)"
    ),
});

type PriceListFormValues = z.infer<typeof priceListSchema>;

type ImportPriceListDialogProps = {
  orgSlug: string;
};

export function ImportPriceListDialog({ orgSlug }: ImportPriceListDialogProps) {
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(false);
  const [missingSkus, setMissingSkus] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();

  const form = useForm<PriceListFormValues>({
    resolver: zodResolver(priceListSchema),
    defaultValues: {
      supplier_id: "",
      name: "",
      valid_from: new Date(),
    },
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form;

  // Fetch suppliers when the dialog opens
  useEffect(() => {
    if (open && suppliers.length === 0) {
      setIsLoadingSuppliers(true);
      fetch(`/api/org/${orgSlug}/proveedores`)
        .then((res) => res.json())
        .then((data) => setSuppliers(data))
        .catch(() => {
          setErrorMessage("Error al cargar los proveedores");
        })
        .finally(() => setIsLoadingSuppliers(false));
    }
  }, [open, orgSlug, suppliers.length]);

  const resetForm = () => {
    setMissingSkus([]);
    setErrorMessage(null);
    setSuccessMessage(null);
    reset();
  };

  const handleClose = () => {
    setOpen(false);
    resetForm();
  };

  const findColumnKey = (
    row: Record<string, unknown>,
    regex: RegExp
  ): string | undefined =>
    Object.keys(row).find((key) => regex.test(key.trim()));

  const parseRowToItem = (
    row: Record<string, unknown>
  ): ImportPriceListItem | null => {
    const skuKey = findColumnKey(row, SKU_COLUMN_REGEX);
    const priceKey = findColumnKey(row, PRICE_COLUMN_REGEX);

    if (!(skuKey && priceKey)) {
      return null;
    }

    const sku = String(row[skuKey]).trim();
    const price = Number(row[priceKey]);

    if (!sku || Number.isNaN(price) || price <= 0) {
      return null;
    }

    const item: ImportPriceListItem = { sku, price };

    return item;
  };

  const parseExcelFile = async (file: File): Promise<ImportPriceListItem[]> => {
    // Dynamically import xlsx to reduce bundle size
    const XLSX = await import("xlsx");

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<
            string,
            unknown
          >[];

          // Expected columns: SKU, Precio (or similar), and optionally Margen
          const items: ImportPriceListItem[] = jsonData
            .map(parseRowToItem)
            .filter((item): item is ImportPriceListItem => item !== null);

          if (items.length === 0) {
            reject(
              new Error(
                "El archivo no contiene datos válidos. Asegúrate de que tenga columnas 'SKU' y 'Precio'."
              )
            );
            return;
          }

          resolve(items);
        } catch (error) {
          reject(
            new Error(
              `Error al parsear el archivo: ${error instanceof Error ? error.message : "Error desconocido"}`
            )
          );
        }
      };

      reader.onerror = () => {
        reject(new Error("Error al leer el archivo"));
      };

      reader.readAsBinaryString(file);
    });
  };

  const formatDateToLocalString = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const handleSuccessWithMissingSkus = (
    skuList: string[],
    importedCount: number
  ) => {
    setMissingSkus(skuList);
    setSuccessMessage(
      `Lista importada con ${importedCount} producto(s) importado(s) exitosamente. ${skuList.length} producto(s) no encontrado(s).`
    );
  };

  const handleSuccessComplete = (importedCount: number) => {
    setSuccessMessage(
      `Lista de precios importada exitosamente. Se importaron ${importedCount} producto(s).`
    );
    handleClose();
    router.refresh();
  };

  const onSubmit = async (values: PriceListFormValues) => {
    try {
      setMissingSkus([]);
      setErrorMessage(null);
      setSuccessMessage(null);

      const file = values.file[0];
      const items = await parseExcelFile(file);
      const validFromDate = formatDateToLocalString(values.valid_from);

      const result = await importPriceListAction({
        orgSlug,
        supplier_id: values.supplier_id,
        name: values.name,
        valid_from: validFromDate,
        items,
      });

      if (!result.success) {
        setErrorMessage(
          result.error || "Error al importar la lista de precios"
        );
        return;
      }

      const hasMissingSkus =
        result.data?.missing_skus && result.data.missing_skus.length > 0;

      if (hasMissingSkus && result.data) {
        handleSuccessWithMissingSkus(
          result.data.missing_skus,
          result.data.imported_count
        );
      } else if (result.data) {
        handleSuccessComplete(result.data.imported_count);
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Error al importar la lista de precios"
      );
    }
  };

  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          resetForm();
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Agregar lista de precios
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Importar lista de precios</DialogTitle>
          <DialogDescription>
            Importa una lista de precios desde un archivo Excel (.xlsx)
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="grid gap-4 py-4">
              {missingSkus.length > 0 && (
                <div className="rounded-md bg-orange-50 p-3">
                  <div className="flex items-start gap-2">
                    <WarningCircle
                      className="size-5 text-orange-600"
                      weight="fill"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-orange-800 text-sm">
                        Productos no encontrados
                      </p>
                      <p className="mt-1 text-orange-700 text-xs">
                        Los siguientes SKUs no se encontraron en el sistema y
                        fueron ignorados:
                      </p>
                      <ul className="mt-2 list-inside list-disc text-orange-700 text-xs">
                        {missingSkus.slice(0, 10).map((sku) => (
                          <li key={sku}>{sku}</li>
                        ))}
                        {missingSkus.length > 10 && (
                          <li>...y {missingSkus.length - 10} más</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {successMessage && (
                <div className="rounded-md bg-green-50 p-3 text-green-800 text-sm">
                  {successMessage}
                </div>
              )}

              <FormField
                control={form.control}
                name="supplier_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proveedor</FormLabel>
                    <Select
                      disabled={isLoadingSuppliers}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              isLoadingSuppliers
                                ? "Cargando proveedores..."
                                : "Selecciona un proveedor"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {suppliers.map((supplier) => (
                          <SelectItem key={supplier.id} value={supplier.id}>
                            {supplier.name}
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre de la lista</FormLabel>
                    <FormControl>
                      <Input
                        disabled={isSubmitting}
                        placeholder="Ej: Lista de precios Enero 2025"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valid_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de vigencia</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            className="w-full justify-start text-left font-normal"
                            disabled={isSubmitting}
                            variant="outline"
                          >
                            <CalendarIcon className="mr-2 size-4" />
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Selecciona una fecha</span>
                            )}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          onSelect={field.onChange}
                          selected={field.value}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="file"
                render={({ field: { onChange, value, ...field } }) => (
                  <FormItem>
                    <FormLabel>Archivo Excel</FormLabel>
                    <FormControl>
                      <Input
                        accept=".xlsx,.xls"
                        disabled={isSubmitting}
                        onChange={(e) => onChange(e.target.files)}
                        type="file"
                        {...field}
                      />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      El archivo debe contener columnas: SKU y Precio
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {errorMessage && (
                <div className="rounded-md bg-red-50 p-3 text-red-800 text-sm">
                  {errorMessage}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={handleClose}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting ? "Importando..." : "Importar lista"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
