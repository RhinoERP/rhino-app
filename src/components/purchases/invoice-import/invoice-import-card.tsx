"use client";

import { FileTextIcon, UploadIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  createInvoiceUploadAction,
  type ImportPurchaseInvoiceResult,
  importPurchaseInvoiceAction,
} from "@/modules/purchases/actions/import-purchase-invoice.action";
import {
  aliasKey,
  daysToDue,
  type ImportedItem,
  invoiceTaxTotal,
  itemFromLine,
  type LineMatch,
  vatRates,
} from "@/modules/purchases/invoice-import/matching";
import type { ExtractedInvoice } from "@/modules/purchases/invoice-import/schema";
import type { ProductWithPrice } from "@/modules/purchases/service/purchases.service";
import type { Supplier } from "@/modules/suppliers/service/suppliers.service";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SKIP = "__omitir__";
const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 2,
});
const amount = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
const MATCH_LABEL: Record<NonNullable<LineMatch["how"]>, string> = {
  recordado: "Recordado",
  codigo: "Por código",
  nombre: "Por nombre",
};
const MONEY_TOLERANCE = 1;

/** Lo que la factura le pasa al formulario de compra. */
export type AppliedInvoiceImport = {
  supplierId: string;
  purchaseDate: string;
  expirationDays: number | null;
  items: ImportedItem[];
  globalDiscountPercent: number;
  vatRates: number[];
  pricesIncludeVat: boolean;
  /** Para registrar la factura y recordar equivalencias después de guardar. */
  finish: {
    path: string;
    filename: string;
    registerInvoice: boolean;
    invoice: {
      tipo: ExtractedInvoice["tipo_comprobante"];
      puntoDeVenta: string | null;
      numero: string;
      fecha: string;
      vencimiento: string | null;
      subtotal: number;
      total: number;
      cotizacion: number | null;
    };
    aliases: { key: string; productId: string }[];
  };
};

type Review = Extract<ImportPurchaseInvoiceResult, { success: true }> & {
  path: string;
  filename: string;
};

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return day && month && year ? `${day}/${month}/${year}` : iso;
}

function invoiceTitle(invoice: ExtractedInvoice): string {
  const number = [invoice.punto_de_venta, invoice.numero]
    .filter(Boolean)
    .join("-");
  return `Factura ${invoice.tipo_comprobante} ${number} · ${formatDate(invoice.fecha)}`;
}

type ChosenItem = { index: number; item: ImportedItem };

/** Sube el PDF a Storage (sin pasar por el servidor) y lo manda a leer. */
async function uploadAndRead(orgSlug: string, file: File): Promise<Review> {
  if (file.type !== "application/pdf") {
    throw new Error("La factura tiene que ser un PDF.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("El PDF no puede superar los 10 MB.");
  }
  const slot = await createInvoiceUploadAction(orgSlug);
  if (!slot.success) {
    throw new Error(slot.error);
  }
  const { path } = slot;
  const { error } = await createClient()
    .storage.from("documents")
    .uploadToSignedUrl(path, slot.token, file, {
      contentType: "application/pdf",
    });
  if (error) {
    throw new Error(`No se pudo subir el PDF: ${error.message}`);
  }
  const formData = new FormData();
  formData.set("orgSlug", orgSlug);
  formData.set("path", path);
  const result = await importPurchaseInvoiceAction(formData);
  if (!result.success) {
    throw new Error(result.error);
  }
  return { ...result, path, filename: file.name };
}

function chosenItems(
  review: Review | null,
  choices: Record<number, string>,
  productsById: Map<string, ProductWithPrice>
): ChosenItem[] {
  if (!review) {
    return [];
  }
  return review.invoice.lineas.flatMap((line, index) => {
    const product = productsById.get(choices[index] ?? "");
    if (!(product?.id && product.name) || product.has_variants) {
      return [];
    }
    return [
      {
        index,
        item: itemFromLine(line, {
          id: product.id,
          name: product.name,
          unit_of_measure: product.unit_of_measure,
          weight_per_unit: product.weight_per_unit,
          units_per_box: product.units_per_box,
          has_variants: product.has_variants,
        }),
      },
    ];
  });
}

function buildApplied(params: {
  review: Review;
  supplierId: string;
  items: ChosenItem[];
  registerInvoice: boolean;
}): AppliedInvoiceImport {
  const { review, supplierId, items, registerInvoice } = params;
  const { invoice } = review;
  return {
    supplierId,
    purchaseDate: invoice.fecha,
    expirationDays: daysToDue(invoice.fecha, invoice.vencimiento),
    items: items.map((row) => row.item),
    globalDiscountPercent: invoice.descuento_global_porcentaje || 0,
    vatRates: invoice.precios_incluyen_iva ? [] : vatRates(invoice),
    pricesIncludeVat: invoice.precios_incluyen_iva,
    finish: {
      path: review.path,
      filename: review.filename,
      registerInvoice,
      invoice: {
        tipo: invoice.tipo_comprobante,
        puntoDeVenta: invoice.punto_de_venta,
        numero: invoice.numero,
        fecha: invoice.fecha,
        vencimiento: invoice.vencimiento,
        subtotal: invoice.total - invoiceTaxTotal(invoice),
        total: invoice.total,
        cotizacion: invoice.cotizacion,
      },
      aliases: items.map((row) => ({
        key: aliasKey(invoice.lineas[row.index]),
        productId: row.item.product_id,
      })),
    },
  };
}

function UploadPrompt({
  reading,
  onFile,
}: {
  reading: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-wrap items-center gap-3 pt-6">
        <FileTextIcon className="size-5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Cargar desde la factura (PDF)</p>
          <p className="text-muted-foreground text-sm">
            Subí la factura del proveedor y se completan solos el proveedor, la
            fecha, los productos, cantidades, precios y descuentos. Lo revisás
            antes de guardar.
          </p>
        </div>
        <input
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) {
              onFile(file);
            }
          }}
          ref={inputRef}
          type="file"
        />
        <Button
          disabled={reading}
          onClick={() => inputRef.current?.click()}
          variant="outline"
        >
          {reading ? <Spinner /> : <UploadIcon />}
          {reading ? "Leyendo la factura…" : "Subir PDF"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ProductSelect({
  value,
  suggested,
  rest,
  onChange,
}: {
  value: string;
  suggested: ProductWithPrice[];
  rest: ProductWithPrice[];
  onChange: (value: string) => void;
}) {
  const option = (p: ProductWithPrice) => (
    <option key={p.id} value={p.id ?? ""}>
      {p.name}
      {p.sku ? ` (${p.sku})` : ""}
    </option>
  );
  return (
    <select
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      onChange={(event) =>
        onChange(event.target.value === SKIP ? "" : event.target.value)
      }
      value={value || SKIP}
    >
      <option value={SKIP}>— Elegí o dejala afuera —</option>
      {suggested.length ? (
        <optgroup label="Sugeridos">{suggested.map(option)}</optgroup>
      ) : null}
      {rest.length ? (
        <optgroup label="Productos del proveedor">{rest.map(option)}</optgroup>
      ) : null}
    </select>
  );
}

function LineRow({
  line,
  match,
  chosen,
  product,
  suggested,
  rest,
  onChoose,
}: {
  line: ExtractedInvoice["lineas"][number];
  match: LineMatch | undefined;
  chosen: string;
  product: ProductWithPrice | undefined;
  suggested: ProductWithPrice[];
  rest: ProductWithPrice[];
  onChoose: (value: string) => void;
}) {
  const how = chosen && match?.productId === chosen ? match.how : null;
  return (
    <TableRow className={cn(!chosen && "bg-amber-50/60 dark:bg-amber-950/20")}>
      <TableCell>
        <div className="font-medium">{line.descripcion}</div>
        {line.codigo ? (
          <div className="text-muted-foreground text-xs">
            Cód. {line.codigo}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right">
        {amount.format(line.cantidad)} {line.unidad.toLowerCase()}
      </TableCell>
      <TableCell className="text-right">
        {money.format(line.precio_unitario)}
      </TableCell>
      <TableCell className="text-right">
        {line.descuento_porcentaje
          ? `${amount.format(line.descuento_porcentaje)} %`
          : "—"}
      </TableCell>
      <TableCell className="text-right">
        {money.format(line.subtotal)}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          <ProductSelect
            onChange={onChoose}
            rest={rest}
            suggested={suggested}
            value={chosen}
          />
          {product?.has_variants ? (
            <span className="text-destructive text-xs">
              Tiene talles/colores: cargalo a mano.
            </span>
          ) : null}
          {how ? (
            <span className="text-muted-foreground text-xs">
              {MATCH_LABEL[how]}
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function SupplierPicker({
  review,
  suppliers,
  supplierId,
  onChange,
}: {
  review: Review;
  suppliers: Supplier[];
  supplierId: string;
  onChange: (value: string) => void;
}) {
  const autoFound =
    review.supplier.how && review.supplier.supplierId === supplierId;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium">Proveedor:</span>
      <select
        className="h-9 min-w-60 rounded-md border border-input bg-background px-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        value={supplierId}
      >
        <option value="">Elegí el proveedor…</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
            {supplier.cuit ? ` · ${supplier.cuit}` : ""}
          </option>
        ))}
      </select>
      {autoFound ? (
        <Badge variant="secondary">
          Encontrado por {review.supplier.how === "cuit" ? "CUIT" : "nombre"}
        </Badge>
      ) : null}
      {supplierId ? null : (
        <span className="text-destructive">
          No está cargado: elegilo o crealo en Proveedores.
        </span>
      )}
    </div>
  );
}

function Totals({
  invoice,
  linesTotal,
  registerInvoice,
  onRegisterChange,
}: {
  invoice: ExtractedInvoice;
  linesTotal: number;
  registerInvoice: boolean;
  onRegisterChange: (value: boolean) => void;
}) {
  const differs =
    Math.abs(linesTotal - invoice.subtotal_neto) > MONEY_TOLERANCE;
  const taxes = invoiceTaxTotal(invoice);
  return (
    <div className="space-y-1 text-sm">
      <p>
        Neto de la factura {money.format(invoice.subtotal_neto)} · Neto de los
        productos elegidos {money.format(linesTotal)}
        {taxes ? ` · Impuestos ${money.format(taxes)}` : ""}
      </p>
      {differs ? (
        <p className="text-amber-700 dark:text-amber-300">
          Los importes no coinciden: revisá las líneas sin producto o los
          descuentos.
        </p>
      ) : null}
      <label className="flex items-center gap-2" htmlFor="register-invoice">
        <input
          checked={registerInvoice}
          className="size-4 accent-primary"
          id="register-invoice"
          onChange={(event) => onRegisterChange(event.target.checked)}
          type="checkbox"
        />
        Al guardar, registrar también la factura del proveedor con el PDF
      </label>
    </div>
  );
}

export function InvoiceImportCard({
  orgSlug,
  suppliers,
  supplierProducts,
  onApply,
}: {
  orgSlug: string;
  suppliers: Supplier[];
  /** Productos del proveedor elegido en el formulario. */
  supplierProducts: ProductWithPrice[];
  onApply: (result: AppliedInvoiceImport) => void;
}) {
  const [reading, setReading] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [registerInvoice, setRegisterInvoice] = useState(true);
  const [applied, setApplied] = useState(false);

  const read = async (file: File) => {
    setReading(true);
    setApplied(false);
    try {
      const result = await uploadAndRead(orgSlug, file);
      setReview(result);
      setSupplierId(result.supplier.supplierId ?? "");
      setChoices(
        Object.fromEntries(
          result.lines.map((line) => [line.index, line.match.productId ?? ""])
        )
      );
      setRegisterInvoice(!result.duplicate);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo leer la factura."
      );
    } finally {
      setReading(false);
    }
  };

  const productsById = useMemo(() => {
    const map = new Map<string, ProductWithPrice>();
    for (const product of [...(review?.products ?? []), ...supplierProducts]) {
      if (product.id) {
        map.set(product.id, product);
      }
    }
    return map;
  }, [review, supplierProducts]);

  const items = useMemo(
    () => chosenItems(review, choices, productsById),
    [review, choices, productsById]
  );

  if (!review) {
    return <UploadPrompt onFile={read} reading={reading} />;
  }

  const { invoice } = review;
  const linesTotal = items.reduce((acc, row) => acc + row.item.subtotal, 0);
  const pending = invoice.lineas.length - items.length;
  const optionsFor = (index: number) => {
    const candidates = review.lines[index]?.match.candidates ?? [];
    return {
      suggested: candidates
        .map((id) => productsById.get(id))
        .filter((p): p is ProductWithPrice => Boolean(p?.id)),
      rest: supplierProducts.filter((p) => p.id && !candidates.includes(p.id)),
    };
  };

  const apply = () => {
    if (!supplierId) {
      toast.error("Elegí el proveedor de la factura.");
      return;
    }
    if (!items.length) {
      toast.error("Elegí el producto de al menos una línea.");
      return;
    }
    onApply(buildApplied({ review, supplierId, items, registerInvoice }));
    setApplied(true);
    toast.success(
      pending
        ? `Pasé ${items.length} productos a la compra. ${pending} líneas quedaron sin producto.`
        : "Listo, la factura está en la compra. Revisá y guardá."
    );
  };

  return (
    <Card className={cn(applied && "border-emerald-500/50")}>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start gap-3">
          <FileTextIcon className="mt-0.5 size-5 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{invoiceTitle(invoice)}</p>
            <p className="text-muted-foreground text-sm">
              {invoice.proveedor.nombre}
              {invoice.proveedor.cuit
                ? ` · CUIT ${invoice.proveedor.cuit}`
                : ""}{" "}
              · Total {money.format(invoice.total)}
              {invoice.moneda === "USD" ? " (USD)" : ""}
            </p>
          </div>
          <Button
            onClick={() => {
              setReview(null);
              setApplied(false);
            }}
            size="sm"
            variant="ghost"
          >
            Otra factura
          </Button>
        </div>

        {review.duplicate ? (
          <p className="rounded-md bg-amber-50 p-2 text-amber-900 text-sm dark:bg-amber-950/30 dark:text-amber-200">
            Esta factura ya está registrada para el proveedor. Revisá que no la
            estés cargando dos veces.
          </p>
        ) : null}
        {invoice.observaciones ? (
          <p className="text-muted-foreground text-sm">
            Nota de la lectura: {invoice.observaciones}
          </p>
        ) : null}

        <SupplierPicker
          onChange={setSupplierId}
          review={review}
          supplierId={supplierId}
          suppliers={suppliers}
        />

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>En la factura</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Bonif.</TableHead>
                <TableHead className="text-right">Importe</TableHead>
                <TableHead className="min-w-64">Producto en Rhinos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lineas.map((line, index) => {
                const chosen = choices[index] ?? "";
                const { suggested, rest } = optionsFor(index);
                return (
                  <LineRow
                    chosen={chosen}
                    key={`${index}-${line.descripcion}`}
                    line={line}
                    match={review.lines[index]?.match}
                    onChoose={(value) =>
                      setChoices((prev) => ({ ...prev, [index]: value }))
                    }
                    product={productsById.get(chosen)}
                    rest={rest}
                    suggested={suggested}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Totals
            invoice={invoice}
            linesTotal={linesTotal}
            onRegisterChange={setRegisterInvoice}
            registerInvoice={registerInvoice}
          />
          <Button onClick={apply}>
            {applied ? "Volver a pasar a la compra" : "Pasar a la compra"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
