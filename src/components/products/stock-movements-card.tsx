"use client";

import { ClockClockwise } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatDateTime } from "@/lib/utils";
import {
  createProductLotAction,
  createStockMovementAction,
} from "@/modules/inventory/actions/stock.actions";
import type {
  Product,
  ProductLotWithStatus,
  StockMovementType,
  StockMovementWithLot,
} from "@/modules/inventory/types";

const leadingZerosRegex = /^0+/;

type StockMovementsCardProps = {
  lots: ProductLotWithStatus[];
  movements: StockMovementWithLot[];
  orgSlug: string;
  productId: string;
  product: Product;
};

const movementLabels: Record<
  StockMovementType,
  { label: string; className: string; prefix: string }
> = {
  INBOUND: {
    label: "Ingreso",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/40",
    prefix: "+",
  },
  OUTBOUND: {
    label: "Salida",
    className: "bg-red-500/10 text-red-500 border-red-500/40",
    prefix: "-",
  },
  ADJUSTMENT: {
    label: "Ajuste",
    className: "bg-blue-500/10 text-blue-500 border-blue-500/40",
    prefix: "±",
  },
  TRANSFER: {
    label: "Transferencia",
    className: "bg-blue-500/10 text-blue-500 border-blue-500/40",
    prefix: "⇄",
  },
};

const formatChange = (
  previous: number | null | undefined,
  next: number | null | undefined
) => {
  if (previous == null || next == null) {
    return "—";
  }
  const delta = next - previous;
  const deltaLabel = `${delta >= 0 ? "+" : ""}${delta.toLocaleString("es-AR")}`;
  return `${previous.toLocaleString("es-AR")} → ${next.toLocaleString("es-AR")} (${deltaLabel})`;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: UI composition with multiple states
export function StockMovementsCard({
  lots,
  movements,
  orgSlug,
  productId,
  product,
}: StockMovementsCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState<string>(lots[0]?.id ?? "");
  const [type, setType] = useState<StockMovementType>("INBOUND");
  const [quantity, setQuantity] = useState("");
  const [unitQuantity, setUnitQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [inboundLotNumber, setInboundLotNumber] = useState("");
  const [inboundExpiration, setInboundExpiration] = useState("");
  const [noExpiry, setNoExpiry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedMovement, setSelectedMovement] =
    useState<StockMovementWithLot | null>(null);
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const isWeightBased =
    product.unit_of_measure === "KG" || product.unit_of_measure === "LT";
  const tracksUnits = isWeightBased && Boolean(product.tracks_stock_units);
  let quantityLabel = "Cantidad";
  if (isWeightBased) {
    quantityLabel =
      product.unit_of_measure === "KG" ? "Cantidad (kg)" : "Cantidad (lt)";
  }
  let stockDetailLabel = "Stock";
  if (isWeightBased) {
    stockDetailLabel =
      product.unit_of_measure === "KG" ? "Stock (kg)" : "Stock (lt)";
  }

  useEffect(() => {
    if (lots.length > 0 && !selectedLotId) {
      setSelectedLotId(lots[0].id);
    }
  }, [lots, selectedLotId]);

  const canCreateMovement = type === "INBOUND" || lots.length > 0;

  const normalizeNumericInput = (value: string) => {
    const cleaned = value.replace(",", ".");
    if (
      cleaned.length > 1 &&
      cleaned.startsWith("0") &&
      !cleaned.startsWith("0.")
    ) {
      const trimmed = cleaned.replace(leadingZerosRegex, "");
      return trimmed === "" ? "0" : trimmed;
    }
    return cleaned;
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: branching for validation is easier to read inline
  const handleSubmit = () => {
    setError(null);
    const parsedQuantity = Number.parseFloat(quantity);
    const normalizedQuantity =
      Number.isFinite(parsedQuantity) && parsedQuantity >= 0
        ? parsedQuantity
        : 0;
    const parsedUnitQuantity = Number.parseFloat(unitQuantity);
    const normalizedUnitQuantity =
      Number.isFinite(parsedUnitQuantity) && parsedUnitQuantity >= 0
        ? parsedUnitQuantity
        : 0;
    const hasUnitQuantityInput = unitQuantity.trim() !== "";
    const digitsOnly = (quantity || "").replace(/\D/g, "");
    const unitDigitsOnly = (unitQuantity || "").replace(/\D/g, "");

    if (digitsOnly.length > 8) {
      setError("La cantidad no puede superar 8 dígitos");
      return;
    }

    if (type !== "INBOUND" && !selectedLotId) {
      setError("Selecciona un lote para registrar el movimiento");
      return;
    }

    let expirationToUse: string | null = null;

    if (type === "INBOUND") {
      if (!inboundLotNumber.trim()) {
        setError("Ingresa el número de lote");
        return;
      }

      if (noExpiry) {
        expirationToUse = null;
      } else {
        if (!inboundExpiration) {
          setError("Selecciona la fecha de vencimiento o marca sin fecha");
          return;
        }

        const parsedDate = new Date(inboundExpiration);
        const year = parsedDate.getFullYear();
        if (Number.isNaN(parsedDate.getTime()) || year < 1900 || year > 2100) {
          setError("La fecha de vencimiento no es válida");
          return;
        }

        expirationToUse = inboundExpiration;
      }

      if (normalizedQuantity <= 0) {
        setError("La cantidad debe ser mayor a 0 para un ingreso");
        return;
      }

      if (
        tracksUnits &&
        (!hasUnitQuantityInput || normalizedUnitQuantity <= 0)
      ) {
        setError("Las unidades deben ser mayores a 0 para un ingreso");
        return;
      }
    }

    if (tracksUnits && unitDigitsOnly.length > 8) {
      setError("Las unidades no pueden superar 8 dígitos");
      return;
    }

    if (
      tracksUnits &&
      type === "OUTBOUND" &&
      (!hasUnitQuantityInput || normalizedUnitQuantity <= 0)
    ) {
      setError("Ingresa las unidades para registrar la salida");
      return;
    }

    let unitQuantityForPayload: number | null | undefined;
    if (tracksUnits) {
      unitQuantityForPayload = hasUnitQuantityInput
        ? normalizedUnitQuantity
        : null;
    }

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: async branching kept together
    startTransition(async () => {
      if (type === "INBOUND") {
        const lotResult = await createProductLotAction({
          orgSlug,
          productId,
          lotNumber: inboundLotNumber,
          expirationDate: expirationToUse,
          quantity: 0,
          unitQuantity: tracksUnits ? 0 : undefined,
        });

        if (!(lotResult.success && lotResult.lotId)) {
          setError(lotResult.error || "No se pudo crear el lote");
          return;
        }

        const movementResult = await createStockMovementAction({
          orgSlug,
          productId,
          lotId: lotResult.lotId,
          type,
          quantity: normalizedQuantity,
          unitQuantity: unitQuantityForPayload,
          reason,
        });

        if (!movementResult.success) {
          setError(
            movementResult.error || "No se pudo registrar el movimiento"
          );
          return;
        }
      } else {
        const result = await createStockMovementAction({
          orgSlug,
          productId,
          lotId: selectedLotId,
          type,
          quantity: normalizedQuantity,
          unitQuantity: unitQuantityForPayload,
          reason,
        });

        if (!result.success) {
          setError(result.error || "No se pudo registrar el movimiento");
          return;
        }
      }

      setOpen(false);
      setQuantity("0");
      setUnitQuantity("");
      setReason("");
      setInboundLotNumber("");
      setInboundExpiration("");
      setNoExpiry(false);
      router.refresh();
    });
  };

  const getLotLabel = useMemo(
    () =>
      lots.reduce<Record<string, string>>((acc, lot) => {
        acc[lot.id] = lot.lot_number;
        return acc;
      }, {}),
    [lots]
  );

  const enrichedMovements = useMemo(() => {
    if (!tracksUnits) {
      return movements;
    }

    const lotUnits = new Map<string, number>();
    for (const lot of lots) {
      lotUnits.set(lot.id, lot.unit_quantity_available ?? 0);
    }

    return movements.map((movement) => {
      const currentUnits = lotUnits.get(movement.lot_id);
      if (currentUnits == null || movement.unit_quantity == null) {
        return {
          ...movement,
          unit_new_stock: null,
          unit_previous_stock: null,
        };
      }

      const unitNewStock = currentUnits;
      const unitPreviousStock = unitNewStock - movement.unit_quantity;
      lotUnits.set(movement.lot_id, unitPreviousStock);

      return {
        ...movement,
        unit_new_stock: unitNewStock,
        unit_previous_stock: unitPreviousStock,
      };
    });
  }, [lots, movements, tracksUnits]);

  const visibleMovements =
    enrichedMovements && enrichedMovements.length > 10
      ? enrichedMovements.slice(0, 10)
      : enrichedMovements;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b">
          <div className="space-y-1">
            <CardTitle className="text-base">Movimientos</CardTitle>
            <CardDescription>Historial y ajustes de stock</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setViewAllOpen(true)}
              size="sm"
              variant="ghost"
            >
              Ver todos
            </Button>
            <Dialog
              onOpenChange={(value) => {
                setOpen(value);
                if (!value) {
                  setError(null);
                  setQuantity("");
                  setUnitQuantity("");
                  setReason("");
                  setInboundLotNumber("");
                  setInboundExpiration("");
                  setNoExpiry(false);
                }
              }}
              open={open}
            >
              <DialogTrigger asChild>
                <Button
                  disabled={!canCreateMovement}
                  size="sm"
                  variant="outline"
                >
                  <ClockClockwise className="mr-2 h-4 w-4" />
                  Registrar movimiento
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                  <DialogTitle>Registrar movimiento</DialogTitle>
                  <DialogDescription>
                    Ajusta el stock del producto seleccionando el lote, tipo y
                    cantidad.
                  </DialogDescription>
                </DialogHeader>

                {type !== "INBOUND" && lots.length === 0 ? (
                  <div className="rounded-md bg-muted p-4 text-muted-foreground text-sm">
                    Agrega un lote antes de registrar movimientos.
                  </div>
                ) : (
                  <div className="space-y-4 py-2">
                    <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                      {type === "INBOUND" ? (
                        <div className="grid gap-2">
                          <Label>Lote</Label>
                          <Input
                            autoFocus
                            disabled={isPending}
                            onChange={(event) =>
                              setInboundLotNumber(event.target.value)
                            }
                            placeholder="Ej: LOT-001"
                            value={inboundLotNumber}
                          />
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          <Label>Lote</Label>
                          <Select
                            disabled={isPending}
                            onValueChange={(value) => setSelectedLotId(value)}
                            value={selectedLotId}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Seleccionar lote" />
                            </SelectTrigger>
                            <SelectContent>
                              {lots.map((lot) => (
                                <SelectItem key={lot.id} value={lot.id}>
                                  {lot.lot_number}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      <div className="grid gap-2">
                        <Label>Tipo</Label>
                        <Select
                          disabled={isPending}
                          onValueChange={(value) =>
                            setType(value as StockMovementType)
                          }
                          value={type}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="INBOUND">Ingreso</SelectItem>
                            <SelectItem value="OUTBOUND">Salida</SelectItem>
                            <SelectItem value="ADJUSTMENT">Ajuste</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {type === "INBOUND" && (
                      <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                        <div className="grid gap-2">
                          <Label>Vencimiento</Label>
                          <Input
                            disabled={isPending || noExpiry}
                            onChange={(event) =>
                              setInboundExpiration(event.target.value)
                            }
                            type="date"
                            value={inboundExpiration}
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-6">
                          <Checkbox
                            checked={noExpiry}
                            disabled={isPending}
                            id="no-expiry"
                            onCheckedChange={(checked) => {
                              setNoExpiry(Boolean(checked));
                              if (checked) {
                                setInboundExpiration("");
                              }
                            }}
                          />
                          <Label
                            className="text-muted-foreground text-sm"
                            htmlFor="no-expiry"
                          >
                            Sin fecha de vencimiento
                          </Label>
                        </div>
                      </div>
                    )}

                    <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                      <div className="grid gap-2">
                        <Label>{quantityLabel}</Label>
                        <Input
                          disabled={isPending}
                          inputMode="decimal"
                          maxLength={12}
                          min="0"
                          onChange={(event) =>
                            setQuantity(
                              normalizeNumericInput(event.target.value)
                            )
                          }
                          onFocus={(event) => event.target.select()}
                          step="0.01"
                          value={quantity}
                        />
                      </div>

                      {tracksUnits ? (
                        <div className="grid gap-2">
                          <Label>Unidades</Label>
                          <Input
                            disabled={isPending}
                            inputMode="decimal"
                            maxLength={12}
                            min="0"
                            onChange={(event) =>
                              setUnitQuantity(
                                normalizeNumericInput(event.target.value)
                              )
                            }
                            onFocus={(event) => event.target.select()}
                            step="1"
                            value={unitQuantity}
                          />
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          <Label>Motivo (opcional)</Label>
                          <Input
                            disabled={isPending}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Ajuste de inventario..."
                            value={reason}
                          />
                        </div>
                      )}
                    </div>

                    {tracksUnits && (
                      <div className="grid gap-2">
                        <Label>Motivo (opcional)</Label>
                        <Input
                          disabled={isPending}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Ajuste de inventario..."
                          value={reason}
                        />
                      </div>
                    )}

                    {error && (
                      <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                        {error}
                      </div>
                    )}
                  </div>
                )}

                <DialogFooter>
                  <Button
                    disabled={isPending}
                    onClick={() => {
                      setOpen(false);
                      setError(null);
                      setQuantity("");
                      setUnitQuantity("");
                      setReason("");
                      setInboundLotNumber("");
                      setInboundExpiration("");
                      setNoExpiry(false);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Cancelar
                  </Button>
                  <Button
                    disabled={isPending || !canCreateMovement}
                    onClick={handleSubmit}
                    type="button"
                  >
                    {isPending ? "Guardando..." : "Guardar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">
                  {isWeightBased ? stockDetailLabel : quantityLabel}
                </TableHead>
                {tracksUnits && (
                  <TableHead className="text-right">Unidades</TableHead>
                )}
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMovements.length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={tracksUnits ? 6 : 5}
                  >
                    Aún no hay movimientos registrados para este producto.
                  </TableCell>
                </TableRow>
              ) : (
                visibleMovements.map((movement) => {
                  const meta = movementLabels[movement.type];
                  const baseChange = formatChange(
                    movement.previous_stock,
                    movement.new_stock
                  );
                  const unitChange = formatChange(
                    movement.unit_previous_stock,
                    movement.unit_new_stock
                  );

                  return (
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      key={movement.id}
                      onClick={() => {
                        setSelectedMovement(movement);
                        setDetailOpen(true);
                      }}
                    >
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDateTime(movement.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {getLotLabel[movement.lot_id] || movement.lot_number}
                      </TableCell>
                      <TableCell>
                        <Badge className={meta.className} variant="secondary">
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {baseChange}
                      </TableCell>
                      {tracksUnits && (
                        <TableCell className="text-right text-sm tabular-nums">
                          {unitChange}
                        </TableCell>
                      )}
                      <TableCell className="max-w-[280px] truncate text-muted-foreground text-sm">
                        {movement.reason || "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog onOpenChange={setViewAllOpen} open={viewAllOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Movimientos</DialogTitle>
            <DialogDescription>
              Historial completo de movimientos del producto.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">
                    {isWeightBased ? stockDetailLabel : quantityLabel}
                  </TableHead>
                  {tracksUnits && (
                    <TableHead className="text-right">Unidades</TableHead>
                  )}
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={tracksUnits ? 6 : 5}
                    >
                      Aún no hay movimientos registrados para este producto.
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((movement) => {
                    const meta = movementLabels[movement.type];
                    const baseChange = formatChange(
                      movement.previous_stock,
                      movement.new_stock
                    );
                    const unitChange = formatChange(
                      movement.unit_previous_stock,
                      movement.unit_new_stock
                    );
                    return (
                      <TableRow key={`${movement.id}-full`}>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDateTime(movement.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {getLotLabel[movement.lot_id] || movement.lot_number}
                        </TableCell>
                        <TableCell>
                          <Badge className={meta.className} variant="secondary">
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {baseChange}
                        </TableCell>
                        {tracksUnits && (
                          <TableCell className="text-right text-sm tabular-nums">
                            {unitChange}
                          </TableCell>
                        )}
                        <TableCell className="max-w-[360px] truncate text-muted-foreground text-sm">
                          {movement.reason || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setDetailOpen} open={detailOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Detalle del movimiento</DialogTitle>
            <DialogDescription>
              Información del movimiento seleccionado.
            </DialogDescription>
          </DialogHeader>

          {selectedMovement ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Fecha</p>
                  <p className="font-medium">
                    {formatDateTime(selectedMovement.created_at)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Tipo</p>
                  <Badge
                    className={movementLabels[selectedMovement.type].className}
                    variant="secondary"
                  >
                    {movementLabels[selectedMovement.type].label}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Lote</p>
                  <p className="font-medium">{selectedMovement.lot_number}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">{stockDetailLabel}</p>
                  <p className="font-medium tabular-nums">
                    {formatChange(
                      selectedMovement.previous_stock,
                      selectedMovement.new_stock
                    )}
                  </p>
                </div>
                {tracksUnits ? (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Unidades</p>
                    <p className="font-medium tabular-nums">
                      {formatChange(
                        selectedMovement.unit_previous_stock,
                        selectedMovement.unit_new_stock
                      )}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-muted-foreground text-sm">Motivo</p>
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  {selectedMovement.reason ? (
                    <p className="whitespace-pre-wrap break-words break-all leading-relaxed">
                      {selectedMovement.reason}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Sin motivo</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Selecciona un movimiento para ver el detalle.
            </p>
          )}

          <DialogFooter>
            <Button
              onClick={() => setDetailOpen(false)}
              type="button"
              variant="outline"
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
