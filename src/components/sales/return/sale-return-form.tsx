"use client";

import {
  ArrowLeftIcon,
  ArrowUDownLeftIcon,
  CheckCircleIcon,
  CurrencyCircleDollarIcon,
  PackageIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import { createSaleReturnAction } from "@/modules/sales/actions/create-sale-return.action";
import type {
  SalesOrderDetail,
  SalesOrderItemDetail,
} from "@/modules/sales/service/sales.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ReturnItemState = {
  returnQuantity: number; // canonical kg for tracksStockUnits, units for others
  unitQuantity?: number; // explicit units for tracksStockUnits (independent input)
  rawWeightStr?: string; // raw string for kg input to preserve decimals
  rawUnitsStr?: string; // raw string for units input (tracksStockUnits)
  restock: boolean;
};

type ImpactStatus = "credit" | "partial" | "settled" | "none";

type Props = {
  sale: SalesOrderDetail;
  orgSlug: string;
  returnedQuantities: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getImpactCardClass(status: ImpactStatus): string {
  if (status === "credit") {
    return "border-blue-200 bg-blue-50/30";
  }
  if (status === "settled") {
    return "border-green-200 bg-green-50/30";
  }
  if (status === "none") {
    return "border-dashed opacity-60";
  }
  return "border-orange-200 bg-orange-50/30";
}

function ImpactStatusIcon({ status }: { status: ImpactStatus }) {
  if (status === "credit") {
    return (
      <CurrencyCircleDollarIcon
        className="size-4 text-blue-600"
        weight="duotone"
      />
    );
  }
  if (status === "settled") {
    return (
      <CheckCircleIcon className="size-4 text-green-600" weight="duotone" />
    );
  }
  if (status === "partial") {
    return <WarningIcon className="size-4 text-orange-600" weight="duotone" />;
  }
  return (
    <PackageIcon className="size-4 text-muted-foreground" weight="duotone" />
  );
}

function resolveStatusLabel(status: SalesOrderDetail["status"]): string {
  if (status === "DELIVERED") {
    return "Entregada";
  }
  return "Despachada";
}

function getPricePerKg(item: SalesOrderItemDetail): number {
  const w = item.weightQuantity;
  if (!w || w === 0) {
    return 0;
  }
  return item.subtotal / w;
}

function getWeightLabel(item: SalesOrderItemDetail): string {
  return item.unitOfMeasure === "LT" ? "Lt" : "Kg";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type ReturnItemRowProps = {
  item: SalesOrderItemDetail;
  state: ReturnItemState;
  isFirst: boolean;
  remainingQty: number; // units for regular; kg for tracksStockUnits
  onQuantityChange: (itemId: string, value: string) => void;
  onWeightChange: (itemId: string, value: string) => void;
  onUnitsChange: (itemId: string, value: string) => void;
  onToggleRestock: (itemId: string) => void;
};

function ReturnInputs({
  item,
  state,
  remainingQty,
  onQuantityChange,
  onWeightChange,
  onUnitsChange,
}: Pick<
  ReturnItemRowProps,
  | "item"
  | "state"
  | "remainingQty"
  | "onQuantityChange"
  | "onWeightChange"
  | "onUnitsChange"
>) {
  if (item.tracksStockUnits) {
    const avg = item.averageQuantityPerUnit ?? 1;
    const remainingUnits = remainingQty / avg;

    const kgValue =
      state.rawWeightStr ??
      (state.returnQuantity === 0 ? "" : String(state.returnQuantity));
    const unitsValue =
      state.rawUnitsStr ??
      (state.returnQuantity === 0 ? "" : String(state.returnQuantity / avg));

    return (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Label
            className="whitespace-nowrap text-muted-foreground text-sm"
            htmlFor={`units-${item.id}`}
          >
            Uds
          </Label>
          <Input
            className="w-20 text-center"
            id={`units-${item.id}`}
            min={0}
            onChange={(e) => onUnitsChange(item.id, e.target.value)}
            placeholder="0"
            step={0.01}
            type="number"
            value={unitsValue}
          />
          <span className="text-muted-foreground text-xs">
            de {remainingUnits.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Label
            className="whitespace-nowrap text-muted-foreground text-sm"
            htmlFor={`weight-${item.id}`}
          >
            {getWeightLabel(item)}
          </Label>
          <Input
            className="w-24 text-center"
            id={`weight-${item.id}`}
            min={0}
            onChange={(e) => onWeightChange(item.id, e.target.value)}
            placeholder="0"
            step={0.001}
            type="number"
            value={kgValue}
          />
          <span className="text-muted-foreground text-xs">
            de {remainingQty} {getWeightLabel(item).toLowerCase()}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Label
        className="whitespace-nowrap text-muted-foreground text-sm"
        htmlFor={`qty-${item.id}`}
      >
        Devolver
      </Label>
      <Input
        className="w-20 text-center"
        id={`qty-${item.id}`}
        max={remainingQty}
        min={0}
        onChange={(e) => onQuantityChange(item.id, e.target.value)}
        placeholder="0"
        type="number"
        value={state.returnQuantity === 0 ? "" : state.returnQuantity}
      />
      <span className="text-muted-foreground text-sm">de {remainingQty}</span>
    </div>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-unit product row branches are inherently complex
function ReturnItemRow({
  item,
  state,
  isFirst,
  remainingQty,
  onQuantityChange,
  onWeightChange,
  onUnitsChange,
  onToggleRestock,
}: ReturnItemRowProps) {
  const isReturning = state.returnQuantity > 0;
  const hasPartialReturns = item.tracksStockUnits
    ? remainingQty < (item.weightQuantity ?? 0)
    : remainingQty < item.quantity;
  const itemCreditValue = isReturning
    ? state.returnQuantity *
      (item.tracksStockUnits ? getPricePerKg(item) : item.unitPrice)
    : 0;

  return (
    <div>
      {!isFirst && <Separator />}
      <div
        className={`flex flex-col gap-3 px-6 py-4 transition-colors ${isReturning ? "bg-red-50/50" : ""}`}
      >
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <p className="font-medium text-sm">{item.name}</p>
            {item.description && item.description !== item.name && (
              <p className="text-muted-foreground text-xs">
                {item.description}
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              {item.tracksStockUnits && hasPartialReturns && (
                <>
                  {remainingQty} {getWeightLabel(item).toLowerCase()}{" "}
                  disponibles de {item.weightQuantity ?? 0}{" "}
                  {getWeightLabel(item).toLowerCase()}
                </>
              )}
              {item.tracksStockUnits && !hasPartialReturns && (
                <>
                  {item.weightQuantity ?? 0}{" "}
                  {getWeightLabel(item).toLowerCase()} ·{" "}
                  {formatCurrency(getPricePerKg(item))}/
                  {getWeightLabel(item).toLowerCase()} ·{" "}
                  {formatCurrency(item.subtotal)} total
                </>
              )}
              {!item.tracksStockUnits && hasPartialReturns && (
                <>
                  {remainingQty} disponibles de {item.quantity} ·{" "}
                  {formatCurrency(item.unitPrice)} c/u
                </>
              )}
              {!(item.tracksStockUnits || hasPartialReturns) && (
                <>
                  {item.quantity} unidades · {formatCurrency(item.unitPrice)}{" "}
                  c/u · {formatCurrency(item.subtotal)} total
                </>
              )}
            </p>
          </div>
          <ReturnInputs
            item={item}
            onQuantityChange={onQuantityChange}
            onUnitsChange={onUnitsChange}
            onWeightChange={onWeightChange}
            remainingQty={remainingQty}
            state={state}
          />
        </div>

        {isReturning && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={state.restock}
                id={`restock-${item.id}`}
                onCheckedChange={() => onToggleRestock(item.id)}
              />
              <Label
                className="cursor-pointer text-sm"
                htmlFor={`restock-${item.id}`}
              >
                Reponer al stock
              </Label>
              <span className="text-muted-foreground text-xs">
                (
                {state.restock
                  ? "se va a crear un movimiento de ingreso"
                  : "no afecta el stock"}
                )
              </span>
            </div>
            <span className="font-medium text-red-600 text-sm">
              − {formatCurrency(itemCreditValue)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

type ImpactSectionProps = {
  status: ImpactStatus;
  totalAmount: number;
  returnTotal: number;
  newTotal: number;
  newPending: number;
  creditGenerated: number;
};

function ImpactSection({
  status,
  totalAmount,
  returnTotal,
  newTotal,
  newPending,
  creditGenerated,
}: ImpactSectionProps) {
  if (status === "none") {
    return (
      <p className="text-muted-foreground text-sm">
        Seleccioná al menos un producto para ver el impacto.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Total en cuenta</dt>
          <dd>{formatCurrency(totalAmount)}</dd>
        </div>
        <div className="flex justify-between text-red-600">
          <dt>Monto devuelto</dt>
          <dd>− {formatCurrency(returnTotal)}</dd>
        </div>
        <Separator />
        <div className="flex justify-between font-medium">
          <dt>Nuevo total</dt>
          <dd>{formatCurrency(newTotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Nuevo saldo pendiente</dt>
          <dd
            className={
              newPending === 0
                ? "font-medium text-green-600"
                : "font-medium text-orange-600"
            }
          >
            {formatCurrency(newPending)}
          </dd>
        </div>
        {creditGenerated > 0 && (
          <div className="flex justify-between text-blue-600">
            <dt>Crédito a favor del cliente</dt>
            <dd className="font-medium">+ {formatCurrency(creditGenerated)}</dd>
          </div>
        )}
      </dl>

      {status === "credit" && (
        <div className="rounded-md bg-blue-100 px-3 py-2 text-blue-800 text-sm">
          El cliente ya pagó más de lo que queda. Se va a generar un crédito a
          favor de <strong>{formatCurrency(creditGenerated)}</strong> que podrá
          aplicarse en futuras cobranzas.
        </div>
      )}
      {status === "settled" && (
        <div className="rounded-md bg-green-100 px-3 py-2 text-green-800 text-sm">
          La cuenta quedará saldada. No hay saldo pendiente ni crédito a favor.
        </div>
      )}
      {status === "partial" && (
        <div className="rounded-md bg-orange-100 px-3 py-2 text-orange-800 text-sm">
          Quedará un saldo pendiente de{" "}
          <strong>{formatCurrency(newPending)}</strong> en la cuenta del
          cliente.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export function SaleReturnForm({ sale, orgSlug, returnedQuantities }: Props) {
  const router = useRouter();

  const returnableItems = useMemo(
    () =>
      sale.items
        .filter((i) => i.productId != null && i.type !== "adjustment")
        .filter((i) => {
          if (i.tracksStockUnits) {
            const alreadyReturnedKg = returnedQuantities[i.id] ?? 0;
            return (i.weightQuantity ?? 0) - alreadyReturnedKg > 0;
          }
          const alreadyReturned = returnedQuantities[i.id] ?? 0;
          return i.quantity - alreadyReturned > 0;
        }),
    [sale.items, returnedQuantities]
  );

  const [itemStates, setItemStates] = useState<Record<string, ReturnItemState>>(
    () =>
      Object.fromEntries(
        returnableItems.map((item) => [
          item.id,
          { returnQuantity: 0, restock: true },
        ])
      )
  );

  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [emitCreditNote, setEmitCreditNote] = useState(false);
  const [additionalCreditAmount, setAdditionalCreditAmount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const returnTotal = useMemo(
    () =>
      returnableItems.reduce((acc, item) => {
        const st = itemStates[item.id];
        const qty = st?.returnQuantity ?? 0;
        const price = item.tracksStockUnits
          ? getPricePerKg(item)
          : item.unitPrice;
        return acc + qty * price;
      }, 0),
    [itemStates, returnableItems]
  );

  const saleTotal = Number(sale.total_amount ?? 0);
  // Use current AR total (already reduced by prior returns) as the base for impact
  const currentARTotal = Number(
    sale.receivable?.total_amount ?? sale.total_amount ?? 0
  );
  const pendingBalance = Number(
    sale.receivable?.pending_balance ?? currentARTotal
  );
  const paidAmount = Math.max(0, currentARTotal - pendingBalance);
  const effectiveReturnTotal = emitCreditNote
    ? truncateMoney(returnTotal + additionalCreditAmount)
    : returnTotal;
  const newTotal = Math.max(0, currentARTotal - effectiveReturnTotal);
  const newPending = Math.max(0, newTotal - paidAmount);
  const creditGenerated = Math.max(0, paidAmount - newTotal);
  const hasAnyReturn = returnTotal > 0;

  const impactStatus: ImpactStatus = useMemo(() => {
    if (!hasAnyReturn) {
      return "none";
    }
    if (creditGenerated > 0) {
      return "credit";
    }
    if (newPending === 0) {
      return "settled";
    }
    return "partial";
  }, [hasAnyReturn, creditGenerated, newPending]);

  function handleQuantityChange(itemId: string, value: string) {
    const item = returnableItems.find((i) => i.id === itemId);
    if (!item) {
      return;
    }
    const remainingQty = item.quantity - (returnedQuantities[itemId] ?? 0);
    const parsed = Number.parseInt(value, 10);
    const clamped = Number.isNaN(parsed)
      ? 0
      : Math.min(Math.max(0, parsed), remainingQty);
    setItemStates((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], returnQuantity: clamped },
    }));
  }

  function handleWeightChange(itemId: string, value: string) {
    const item = returnableItems.find((i) => i.id === itemId);
    if (!item) {
      return;
    }
    const remainingKg =
      (item.weightQuantity ?? 0) - (returnedQuantities[itemId] ?? 0);
    const parsed = Number.parseFloat(value);
    const clamped = Number.isNaN(parsed)
      ? 0
      : Math.min(Math.max(0, parsed), remainingKg);
    setItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        returnQuantity: clamped,
        rawWeightStr: value,
      },
    }));
  }

  function handleUnitsChange(itemId: string, value: string) {
    const item = returnableItems.find((i) => i.id === itemId);
    if (!item) {
      return;
    }
    const parsedUnits = Number.parseFloat(value);
    const clampedUnits = Number.isNaN(parsedUnits)
      ? 0
      : Math.max(0, parsedUnits);
    setItemStates((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        unitQuantity: clampedUnits,
        rawUnitsStr: value,
      },
    }));
  }

  function handleToggleRestock(itemId: string) {
    setItemStates((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], restock: !prev[itemId].restock },
    }));
  }

  async function handleSubmit() {
    if (!(hasAnyReturn && reason.trim())) {
      return;
    }

    setIsSubmitting(true);
    try {
      const items = returnableItems
        .map((item) => {
          const st = itemStates[item.id];
          return {
            salesOrderItemId: item.id,
            productId: item.productId as string,
            quantity: st?.returnQuantity ?? 0,
            unitPrice: item.tracksStockUnits
              ? getPricePerKg(item)
              : item.unitPrice,
            unitQuantity: item.tracksStockUnits
              ? (st?.unitQuantity ?? 0)
              : undefined,
            restock: st?.restock ?? true,
          };
        })
        .filter((i) => i.quantity > 0);

      const result = await createSaleReturnAction({
        orgSlug,
        saleId: sale.id,
        reason: reason.trim(),
        notes: notes.trim() || null,
        items,
        emitCreditNote,
        ...(emitCreditNote && additionalCreditAmount > 0
          ? { additionalCreditAmount }
          : {}),
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (emitCreditNote && result.data.creditNoteNumber) {
        toast.success(
          `Devolución registrada · NC ${result.data.creditNoteNumber} emitida`
        );
      } else {
        toast.success("Devolución registrada correctamente");
      }
      router.push(`/org/${orgSlug}/ventas/${sale.id}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const customerName =
    sale.customer.fantasy_name ?? sale.customer.business_name;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild size="icon" variant="ghost">
          <Link href={`/org/${orgSlug}/ventas/${sale.id}`}>
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-semibold text-xl">Devolución</h1>
          <p className="text-muted-foreground text-sm">
            Venta {sale.invoice_number ?? `N°${sale.sale_number}`}
          </p>
        </div>
        <Badge className="ml-auto" variant="secondary">
          {resolveStatusLabel(sale.status)}
        </Badge>
      </div>

      {/* Resumen */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Venta original</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Cliente</dt>
              <dd className="font-medium">{customerName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha</dt>
              <dd className="font-medium">{sale.sale_date}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium">{formatCurrency(saleTotal)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Saldo pendiente</dt>
              <dd className="font-medium text-orange-600">
                {formatCurrency(pendingBalance)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pagado</dt>
              <dd className="font-medium text-green-600">
                {formatCurrency(paidAmount)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Productos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Productos a devolver</CardTitle>
          <CardDescription>
            Ingresá la cantidad a devolver de cada producto. Dejá en 0 los que
            no se devuelven.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 p-0">
          {returnableItems.map((item, idx) => {
            const st = itemStates[item.id];
            if (!st) {
              return null;
            }
            const remainingQty = item.tracksStockUnits
              ? (item.weightQuantity ?? 0) - (returnedQuantities[item.id] ?? 0)
              : item.quantity - (returnedQuantities[item.id] ?? 0);
            return (
              <ReturnItemRow
                isFirst={idx === 0}
                item={item}
                key={item.id}
                onQuantityChange={handleQuantityChange}
                onToggleRestock={handleToggleRestock}
                onUnitsChange={handleUnitsChange}
                onWeightChange={handleWeightChange}
                remainingQty={remainingQty}
                state={st}
              />
            );
          })}
        </CardContent>
      </Card>

      {/* Motivo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Motivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reason">Motivo de devolución *</Label>
            <Input
              id="reason"
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: producto vencido, error en pedido..."
              value={reason}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">
              Notas adicionales{" "}
              <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              id="notes"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones internas..."
              rows={3}
              value={notes}
            />
          </div>
        </CardContent>
      </Card>

      {/* Impacto financiero */}
      <Card className={getImpactCardClass(impactStatus)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImpactStatusIcon status={impactStatus} />
            Impacto financiero
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ImpactSection
            creditGenerated={creditGenerated}
            newPending={newPending}
            newTotal={newTotal}
            returnTotal={returnTotal}
            status={impactStatus}
            totalAmount={currentARTotal}
          />
          {emitCreditNote && (
            <div className="mt-4 space-y-2 rounded-md border p-3">
              <Label
                className="font-medium text-sm"
                htmlFor="additional-credit"
              >
                Ajuste manual ($)
              </Label>
              <Input
                id="additional-credit"
                min={0}
                onChange={(e) =>
                  setAdditionalCreditAmount(
                    Math.max(0, Number(e.target.value) || 0)
                  )
                }
                placeholder="0"
                type="number"
                value={additionalCreditAmount || ""}
              />
              <p className="text-muted-foreground text-xs">
                Monto adicional a incluir en la NC (ej: proporcional de
                impuestos no trackeados, extra por perjuicios, etc.)
              </p>
              {additionalCreditAmount > 0 && (
                <p className="font-medium text-blue-600 text-sm">
                  Total NC: {formatCurrency(returnTotal)} (productos) +{" "}
                  {formatCurrency(additionalCreditAmount)} (ajuste) ={" "}
                  {formatCurrency(effectiveReturnTotal)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Emitir NC */}
      {hasAnyReturn && (
        <Card className="border-2">
          <CardContent className="flex items-center gap-3 pt-4">
            <Checkbox
              checked={emitCreditNote}
              id="emit-nc"
              onCheckedChange={(v) => {
                setEmitCreditNote(v === true);
                if (!v) {
                  setAdditionalCreditAmount(0);
                }
              }}
            />
            <Label className="cursor-pointer text-sm" htmlFor="emit-nc">
              Emitir nota de crédito
            </Label>
            <span className="text-muted-foreground text-xs">
              (genera un documento financiero vinculado a la devolución)
            </span>
          </CardContent>
        </Card>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-3 pb-8">
        <Button asChild disabled={isSubmitting} variant="outline">
          <Link href={`/org/${orgSlug}/ventas/${sale.id}`}>Cancelar</Link>
        </Button>
        <Button
          disabled={!(hasAnyReturn && reason.trim()) || isSubmitting}
          onClick={handleSubmit}
        >
          <ArrowUDownLeftIcon className="mr-2 size-4" />
          {isSubmitting ? "Registrando..." : "Registrar devolución"}
        </Button>
      </div>
    </div>
  );
}
