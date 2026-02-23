"use client";

import {
  DotsThreeOutlineVerticalIcon,
  PlusCircle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
  deleteProductLotAction,
  updateProductLotAction,
} from "@/modules/inventory/actions/stock.actions";
import type { Product, ProductLotWithStatus } from "@/modules/inventory/types";

const leadingZerosRegex = /^0+/;
const noExpirationFallback = "2100-12-31";

type ProductLotsCardProps = {
  lots: ProductLotWithStatus[];
  orgSlug: string;
  productId: string;
  product: Product;
};

const getDateInputValue = (expirationDate: string | null): string =>
  expirationDate ? expirationDate.slice(0, 10) : "";

const getMinimumAllowedQuantity = (lot: ProductLotWithStatus): number => {
  const soldQuantity = lot.soldQuantityFromSales ?? 0;
  if (soldQuantity <= 0) {
    return 0;
  }

  return Math.max(0, (lot.quantity_available ?? 0) - soldQuantity);
};

const getMinimumAllowedUnitQuantity = (lot: ProductLotWithStatus): number => {
  const soldUnits = lot.soldUnitQuantityFromSales ?? 0;
  if (soldUnits <= 0) {
    return 0;
  }

  return Math.max(0, (lot.unit_quantity_available ?? 0) - soldUnits);
};

const hasQuantitySalesRestriction = (lot: ProductLotWithStatus): boolean =>
  getMinimumAllowedQuantity(lot) > 0;

const hasUnitSalesRestriction = (lot: ProductLotWithStatus): boolean =>
  getMinimumAllowedUnitQuantity(lot) > 0;

const stockAdjustmentHint =
  " Si necesitas reducir stock, realiza un ajuste en los movimientos de stock.";

type LotFormValidationInput = {
  quantity: string;
  unitQuantity: string;
  expirationDate: string;
  noExpiry: boolean;
  tracksUnits: boolean;
};

type LotFormValidationResult =
  | {
      success: true;
      normalizedQuantity: number;
      normalizedUnitQuantity: number;
      expirationToUse: string | null;
    }
  | {
      success: false;
      error: string;
    };

const parseNonNegativeFloat = (value: string): number => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
};

const hasMoreThanEightDigits = (value: string): boolean =>
  (value || "").replace(/\D/g, "").length > 8;

const resolveExpirationForSubmit = (
  noExpiry: boolean,
  expirationDate: string
):
  | { success: true; expirationToUse: string | null }
  | { success: false; error: string } => {
  if (noExpiry) {
    return { success: true, expirationToUse: null };
  }

  if (!expirationDate) {
    return {
      success: false,
      error: "Selecciona la fecha de vencimiento o marca sin fecha",
    };
  }

  const parsedDate = new Date(expirationDate);
  const year = parsedDate.getFullYear();
  if (Number.isNaN(parsedDate.getTime()) || year < 1900 || year > 2100) {
    return { success: false, error: "La fecha de vencimiento no es válida" };
  }

  return { success: true, expirationToUse: expirationDate };
};

const validateLotFormInputs = (
  input: LotFormValidationInput
): LotFormValidationResult => {
  if (hasMoreThanEightDigits(input.quantity)) {
    return { success: false, error: "La cantidad no puede superar 8 dígitos" };
  }

  if (input.tracksUnits) {
    if (hasMoreThanEightDigits(input.unitQuantity)) {
      return {
        success: false,
        error: "Las unidades no pueden superar 8 dígitos",
      };
    }

    if (input.unitQuantity.trim() === "") {
      return {
        success: false,
        error: "Ingresa las unidades disponibles para el lote",
      };
    }
  }

  const expirationResult = resolveExpirationForSubmit(
    input.noExpiry,
    input.expirationDate
  );
  if (!expirationResult.success) {
    return expirationResult;
  }

  return {
    success: true,
    normalizedQuantity: parseNonNegativeFloat(input.quantity),
    normalizedUnitQuantity: parseNonNegativeFloat(input.unitQuantity),
    expirationToUse: expirationResult.expirationToUse,
  };
};

const getQuantityRestrictionError = (
  lot: ProductLotWithStatus,
  nextQuantity: number
): string | null => {
  if (!hasQuantitySalesRestriction(lot)) {
    return null;
  }

  const minimumQuantity = getMinimumAllowedQuantity(lot);
  if (nextQuantity >= minimumQuantity) {
    return null;
  }

  return `No puedes reducir la cantidad por debajo de ${minimumQuantity.toLocaleString("es-AR")} porque el lote ya fue usado en ventas.${stockAdjustmentHint}`;
};

const getUnitsRestrictionError = (
  lot: ProductLotWithStatus,
  tracksUnits: boolean,
  nextUnitQuantity: number
): string | null => {
  if (!(tracksUnits && hasUnitSalesRestriction(lot))) {
    return null;
  }

  const minimumUnits = getMinimumAllowedUnitQuantity(lot);
  if (nextUnitQuantity >= minimumUnits) {
    return null;
  }

  return `No puedes reducir las unidades por debajo de ${minimumUnits.toLocaleString("es-AR")} porque el lote ya fue usado en ventas.${stockAdjustmentHint}`;
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: component keeps related UI state and validation together for readability
export function ProductLotsCard({
  lots,
  orgSlug,
  productId,
  product,
}: ProductLotsCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lotNumber, setLotNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitQuantity, setUnitQuantity] = useState("");
  const [noExpiry, setNoExpiry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreatePending, startCreateTransition] = useTransition();

  const [editingLot, setEditingLot] = useState<ProductLotWithStatus | null>(
    null
  );
  const [editLotNumber, setEditLotNumber] = useState("");
  const [editExpirationDate, setEditExpirationDate] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnitQuantity, setEditUnitQuantity] = useState("");
  const [editNoExpiry, setEditNoExpiry] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditPending, startEditTransition] = useTransition();

  const [lotToDelete, setLotToDelete] = useState<ProductLotWithStatus | null>(
    null
  );
  const [isDeletePending, startDeleteTransition] = useTransition();

  const [viewAllOpen, setViewAllOpen] = useState(false);

  const isWeightBased =
    product.unit_of_measure === "KG" || product.unit_of_measure === "LT";
  const tracksUnits = isWeightBased && Boolean(product.tracks_stock_units);
  let quantityLabel = "Cantidad disponible";
  if (isWeightBased) {
    quantityLabel =
      product.unit_of_measure === "KG"
        ? "Cantidad disponible (kg)"
        : "Cantidad disponible (lt)";
  }

  let availabilityLabel = "Disponible";
  if (isWeightBased) {
    availabilityLabel =
      product.unit_of_measure === "KG" ? "Disponible (kg)" : "Disponible (lt)";
  }

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

  const resetForm = () => {
    setLotNumber("");
    setExpirationDate("");
    setQuantity("");
    setUnitQuantity("");
    setNoExpiry(false);
    setError(null);
  };

  const resetEditForm = () => {
    setEditingLot(null);
    setEditLotNumber("");
    setEditExpirationDate("");
    setEditQuantity("");
    setEditUnitQuantity("");
    setEditNoExpiry(false);
    setEditError(null);
  };

  const openEditDialog = (lot: ProductLotWithStatus) => {
    const dateValue = getDateInputValue(lot.expiration_date);
    const isNoExpiry = dateValue === noExpirationFallback;

    setEditingLot(lot);
    setEditLotNumber(lot.lot_number);
    setEditExpirationDate(isNoExpiry ? "" : dateValue);
    setEditNoExpiry(isNoExpiry);
    setEditQuantity(String(lot.quantity_available ?? 0));
    setEditUnitQuantity(String(lot.unit_quantity_available ?? 0));
    setEditError(null);
  };

  const handleCreateSubmit = () => {
    setError(null);

    const validation = validateLotFormInputs({
      quantity,
      unitQuantity,
      expirationDate,
      noExpiry,
      tracksUnits,
    });
    if (!validation.success) {
      setError(validation.error);
      return;
    }

    startCreateTransition(async () => {
      const result = await createProductLotAction({
        orgSlug,
        productId,
        lotNumber,
        expirationDate: validation.expirationToUse,
        quantity: validation.normalizedQuantity,
        unitQuantity: tracksUnits
          ? validation.normalizedUnitQuantity
          : undefined,
      });

      if (!result.success) {
        setError(result.error || "No se pudo crear el lote");
        return;
      }

      resetForm();
      setOpen(false);
      router.refresh();
    });
  };

  const handleEditSubmit = () => {
    if (!editingLot) {
      return;
    }

    setEditError(null);

    const validation = validateLotFormInputs({
      quantity: editQuantity,
      unitQuantity: editUnitQuantity,
      expirationDate: editExpirationDate,
      noExpiry: editNoExpiry,
      tracksUnits,
    });
    if (!validation.success) {
      setEditError(validation.error);
      return;
    }

    const quantityRestrictionError = getQuantityRestrictionError(
      editingLot,
      validation.normalizedQuantity
    );
    if (quantityRestrictionError) {
      setEditError(quantityRestrictionError);
      return;
    }

    const unitsRestrictionError = getUnitsRestrictionError(
      editingLot,
      tracksUnits,
      validation.normalizedUnitQuantity
    );
    if (unitsRestrictionError) {
      setEditError(unitsRestrictionError);
      return;
    }

    startEditTransition(async () => {
      const result = await updateProductLotAction({
        orgSlug,
        productId,
        lotId: editingLot.id,
        lotNumber: editLotNumber,
        expirationDate: validation.expirationToUse,
        quantity: validation.normalizedQuantity,
        unitQuantity: tracksUnits
          ? validation.normalizedUnitQuantity
          : undefined,
      });

      if (!result.success) {
        const message = result.error || "No se pudo editar el lote";
        setEditError(message);
        toast.error(message);
        return;
      }

      resetEditForm();
      toast.success("Lote actualizado correctamente");
      router.refresh();
    });
  };

  const handleDeleteLot = () => {
    if (!lotToDelete) {
      return;
    }

    startDeleteTransition(async () => {
      const result = await deleteProductLotAction({
        orgSlug,
        productId,
        lotId: lotToDelete.id,
      });

      if (!result.success) {
        toast.error(result.error || "No se pudo eliminar el lote");
        return;
      }

      setLotToDelete(null);
      toast.success("Lote eliminado correctamente");
      router.refresh();
    });
  };

  const renderStatus = (lot: ProductLotWithStatus) => {
    if (Number(lot.quantity_available) <= 0) {
      return (
        <Badge className="border-red-500/40 bg-red-500/10 text-red-500">
          Agotado
        </Badge>
      );
    }

    if (lot.isExpired) {
      return <Badge variant="destructive">Vencido</Badge>;
    }

    if (typeof lot.expiresInDays === "number" && lot.expiresInDays <= 30) {
      return (
        <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-500">
          Vence en {lot.expiresInDays} días
        </Badge>
      );
    }

    return <Badge variant="secondary">Vigente</Badge>;
  };

  const renderActions = (lot: ProductLotWithStatus) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-8 w-8 p-0" variant="ghost">
          <span className="sr-only">Abrir acciones del lote</span>
          <DotsThreeOutlineVerticalIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          disabled={isEditPending || isDeletePending}
          onSelect={() => openEditDialog(lot)}
        >
          Editar lote
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={isDeletePending}
          onSelect={(event) => {
            if (lot.hasSalesReferences) {
              event.preventDefault();
              toast.error(
                "No se puede eliminar este lote porque ya fue usado en ventas."
              );
              return;
            }

            setLotToDelete(lot);
          }}
        >
          Eliminar lote
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderLotRow = (lot: ProductLotWithStatus, key: string) => (
    <TableRow key={key}>
      <TableCell className="font-medium">{lot.lot_number}</TableCell>
      <TableCell>
        {lot.expiration_date ? formatDateTime(lot.expiration_date) : "—"}
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        {lot.quantity_available.toLocaleString("es-AR")}
      </TableCell>
      {tracksUnits && (
        <TableCell className="text-right font-semibold tabular-nums">
          {(lot.unit_quantity_available ?? 0).toLocaleString("es-AR")}
        </TableCell>
      )}
      <TableCell className="text-right">{renderStatus(lot)}</TableCell>
      <TableCell className="text-right">{renderActions(lot)}</TableCell>
    </TableRow>
  );

  const editingLotMinimumQuantity = editingLot
    ? getMinimumAllowedQuantity(editingLot)
    : 0;
  const editingLotMinimumUnits = editingLot
    ? getMinimumAllowedUnitQuantity(editingLot)
    : 0;
  const editingLotHasSalesHistory = editingLot
    ? editingLot.hasSalesReferences
    : false;
  const editingLotHasQuantityRestriction = editingLot
    ? hasQuantitySalesRestriction(editingLot)
    : false;
  const editingLotHasUnitRestriction = editingLot
    ? hasUnitSalesRestriction(editingLot)
    : false;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b">
          <div className="space-y-1">
            <CardTitle className="text-base">Lotes</CardTitle>
            <CardDescription>Disponibilidad por lote</CardDescription>
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
                  resetForm();
                }
              }}
              open={open}
            >
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Nuevo lote
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Nuevo lote</DialogTitle>
                  <DialogDescription>
                    Registra un lote con su stock inicial y fecha de
                    vencimiento.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="grid gap-2">
                    <Label htmlFor="lotNumber">Número de lote</Label>
                    <Input
                      autoFocus
                      disabled={isCreatePending}
                      id="lotNumber"
                      onChange={(event) => setLotNumber(event.target.value)}
                      placeholder="Ej: LOT-001"
                      value={lotNumber}
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="expirationDate">Vencimiento</Label>
                      <Input
                        className="flex-1"
                        disabled={isCreatePending || noExpiry}
                        id="expirationDate"
                        onChange={(event) =>
                          setExpirationDate(event.target.value)
                        }
                        type="date"
                        value={expirationDate}
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <Checkbox
                        checked={noExpiry}
                        disabled={isCreatePending}
                        id="no-expiration"
                        onCheckedChange={(checked) => {
                          setNoExpiry(Boolean(checked));
                          if (checked) {
                            setExpirationDate("");
                          }
                        }}
                      />
                      <Label
                        className="text-muted-foreground text-sm"
                        htmlFor="no-expiration"
                      >
                        Sin fecha de vencimiento
                      </Label>
                    </div>
                  </div>

                  {tracksUnits ? (
                    <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="quantity">{quantityLabel}</Label>
                        <Input
                          disabled={isCreatePending}
                          id="quantity"
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
                      <div className="grid gap-2">
                        <Label htmlFor="unitQuantity">
                          Unidades disponibles
                        </Label>
                        <Input
                          disabled={isCreatePending}
                          id="unitQuantity"
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
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <Label htmlFor="quantity">{quantityLabel}</Label>
                      <Input
                        disabled={isCreatePending}
                        id="quantity"
                        inputMode="decimal"
                        maxLength={12}
                        min="0"
                        onChange={(event) =>
                          setQuantity(normalizeNumericInput(event.target.value))
                        }
                        onFocus={(event) => event.target.select()}
                        step="0.01"
                        value={quantity}
                      />
                    </div>
                  )}

                  {error && (
                    <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                      {error}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    disabled={isCreatePending}
                    onClick={() => {
                      setOpen(false);
                      resetForm();
                    }}
                    type="button"
                    variant="outline"
                  >
                    Cancelar
                  </Button>
                  <Button
                    disabled={isCreatePending}
                    onClick={handleCreateSubmit}
                    type="button"
                  >
                    {isCreatePending ? "Guardando..." : "Guardar lote"}
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
                <TableHead>Lote</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead className="text-right">
                  {availabilityLabel}
                </TableHead>
                {tracksUnits && (
                  <TableHead className="text-right">Unidades</TableHead>
                )}
                <TableHead className="text-right">Estado</TableHead>
                <TableHead className="w-14 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lots.length === 0 ? [] : lots).slice(0, 10).length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={tracksUnits ? 6 : 5}
                  >
                    Aún no hay lotes registrados para este producto.
                  </TableCell>
                </TableRow>
              ) : (
                lots.slice(0, 10).map((lot) => renderLotRow(lot, lot.id))
              )}
            </TableBody>
          </Table>

          <Separator />
          <div className="flex items-center justify-between px-4 py-3 text-muted-foreground text-sm">
            <span>{lots.length} lote(s)</span>
            <span>
              Última actualización{" "}
              {lots[0]?.updated_at ? formatDateTime(lots[0].updated_at) : "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      <Dialog onOpenChange={setViewAllOpen} open={viewAllOpen}>
        <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Lotes</DialogTitle>
            <DialogDescription>
              Disponibilidad completa por lote.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">
                    {availabilityLabel}
                  </TableHead>
                  {tracksUnits && (
                    <TableHead className="text-right">Unidades</TableHead>
                  )}
                  <TableHead className="text-right">Estado</TableHead>
                  <TableHead className="w-14 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={tracksUnits ? 6 : 5}
                    >
                      Aún no hay lotes registrados para este producto.
                    </TableCell>
                  </TableRow>
                ) : (
                  lots.map((lot) => renderLotRow(lot, `${lot.id}-full`))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(openValue) => !openValue && resetEditForm()}
        open={Boolean(editingLot)}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Editar lote</DialogTitle>
            <DialogDescription>
              Actualiza los datos del lote seleccionado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="editLotNumber">Número de lote</Label>
              <Input
                autoFocus
                disabled={isEditPending}
                id="editLotNumber"
                onChange={(event) => setEditLotNumber(event.target.value)}
                placeholder="Ej: LOT-001"
                value={editLotNumber}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <Label htmlFor="editExpirationDate">Vencimiento</Label>
                <Input
                  className="flex-1"
                  disabled={isEditPending || editNoExpiry}
                  id="editExpirationDate"
                  onChange={(event) =>
                    setEditExpirationDate(event.target.value)
                  }
                  type="date"
                  value={editExpirationDate}
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  checked={editNoExpiry}
                  disabled={isEditPending}
                  id="edit-no-expiration"
                  onCheckedChange={(checked) => {
                    setEditNoExpiry(Boolean(checked));
                    if (checked) {
                      setEditExpirationDate("");
                    }
                  }}
                />
                <Label
                  className="text-muted-foreground text-sm"
                  htmlFor="edit-no-expiration"
                >
                  Sin fecha de vencimiento
                </Label>
              </div>
            </div>

            {tracksUnits ? (
              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="editQuantity">{quantityLabel}</Label>
                  <Input
                    disabled={isEditPending}
                    id="editQuantity"
                    inputMode="decimal"
                    maxLength={12}
                    min="0"
                    onChange={(event) =>
                      setEditQuantity(normalizeNumericInput(event.target.value))
                    }
                    onFocus={(event) => event.target.select()}
                    step="0.01"
                    value={editQuantity}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="editUnitQuantity">Unidades disponibles</Label>
                  <Input
                    disabled={isEditPending}
                    id="editUnitQuantity"
                    inputMode="decimal"
                    maxLength={12}
                    min="0"
                    onChange={(event) =>
                      setEditUnitQuantity(
                        normalizeNumericInput(event.target.value)
                      )
                    }
                    onFocus={(event) => event.target.select()}
                    step="1"
                    value={editUnitQuantity}
                  />
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="editQuantity">{quantityLabel}</Label>
                <Input
                  disabled={isEditPending}
                  id="editQuantity"
                  inputMode="decimal"
                  maxLength={12}
                  min="0"
                  onChange={(event) =>
                    setEditQuantity(normalizeNumericInput(event.target.value))
                  }
                  onFocus={(event) => event.target.select()}
                  step="0.01"
                  value={editQuantity}
                />
              </div>
            )}

            {editingLotHasSalesHistory && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 text-sm">
                Este lote ya fue usado en ventas.
                {editingLotHasQuantityRestriction
                  ? ` No puedes reducir la cantidad por debajo de ${editingLotMinimumQuantity.toLocaleString("es-AR")}.`
                  : ""}
                {tracksUnits && editingLotHasUnitRestriction
                  ? ` No puedes reducir las unidades por debajo de ${editingLotMinimumUnits.toLocaleString("es-AR")}.`
                  : ""}
                {editingLotHasQuantityRestriction ||
                (tracksUnits && editingLotHasUnitRestriction)
                  ? ""
                  : " Puedes editar los datos del lote."}
                {stockAdjustmentHint}
              </div>
            )}

            {editError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                {editError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              disabled={isEditPending}
              onClick={resetEditForm}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button
              disabled={isEditPending}
              onClick={handleEditSubmit}
              type="button"
            >
              {isEditPending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(openValue) => {
          if (!openValue) {
            setLotToDelete(null);
          }
        }}
        open={Boolean(lotToDelete)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar lote?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el lote {lotToDelete?.lot_number}. No podrás
              deshacer este cambio.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletePending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletePending}
              onClick={handleDeleteLot}
            >
              {isDeletePending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
