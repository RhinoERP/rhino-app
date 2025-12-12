"use client";

import { PlusCircle } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { createProductLotAction } from "@/modules/inventory/actions/stock.actions";
import type { ProductLotWithStatus } from "@/modules/inventory/types";

type ProductLotsCardProps = {
  lots: ProductLotWithStatus[];
  orgSlug: string;
  productId: string;
};

export function ProductLotsCard({
  lots,
  orgSlug,
  productId,
}: ProductLotsCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lotNumber, setLotNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [noExpiry, setNoExpiry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [viewAllOpen, setViewAllOpen] = useState(false);

  const resetForm = () => {
    setLotNumber("");
    setExpirationDate("");
    setQuantity("0");
    setNoExpiry(false);
    setError(null);
  };

  const handleSubmit = () => {
    setError(null);
    const parsedQuantity = Number.parseFloat(quantity);
    const normalizedQuantity =
      Number.isFinite(parsedQuantity) && parsedQuantity >= 0
        ? parsedQuantity
        : 0;

    const digitsOnly = (quantity || "").replace(/\D/g, "");

    if (digitsOnly.length > 8) {
      setError("La cantidad no puede superar 8 dígitos");
      return;
    }

    let expirationToUse: string | null = null;
    if (!noExpiry) {
      if (!expirationDate) {
        setError("Selecciona la fecha de vencimiento o marca sin fecha");
        return;
      }

      const parsedDate = new Date(expirationDate);
      const year = parsedDate.getFullYear();
      if (Number.isNaN(parsedDate.getTime()) || year < 1900 || year > 2100) {
        setError("La fecha de vencimiento no es válida");
        return;
      }

      expirationToUse = expirationDate;
    }

    startTransition(async () => {
      const result = await createProductLotAction({
        orgSlug,
        productId,
        lotNumber,
        expirationDate: expirationToUse,
        quantity: normalizedQuantity,
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
                      disabled={isPending}
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
                        disabled={isPending || noExpiry}
                        id="expirationDate"
                        onChange={(event) =>
                          setExpirationDate(event.target.value)
                        }
                        type="date"
                        value={expirationDate}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="quantity">Cantidad disponible</Label>
                      <Input
                        disabled={isPending}
                        id="quantity"
                        inputMode="decimal"
                        maxLength={12}
                        min="0"
                        onChange={(event) => setQuantity(event.target.value)}
                        step="0.01"
                        value={quantity}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={noExpiry}
                      disabled={isPending}
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

                  {error && (
                    <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm">
                      {error}
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    disabled={isPending}
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
                    disabled={isPending}
                    onClick={handleSubmit}
                    type="button"
                  >
                    {isPending ? "Guardando..." : "Guardar lote"}
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
                <TableHead className="text-right">Disponible</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lots.length === 0 ? [] : lots).slice(0, 10).length === 0 ? (
                <TableRow>
                  <TableCell
                    className="py-10 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    Aún no hay lotes registrados para este producto.
                  </TableCell>
                </TableRow>
              ) : (
                lots.slice(0, 10).map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">
                      {lot.lot_number}
                    </TableCell>
                    <TableCell>
                      {lot.expiration_date
                        ? formatDateTime(lot.expiration_date)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {lot.quantity_available.toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell className="text-right">
                      {renderStatus(lot)}
                    </TableCell>
                  </TableRow>
                ))
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
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lots.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="py-10 text-center text-muted-foreground"
                      colSpan={4}
                    >
                      Aún no hay lotes registrados para este producto.
                    </TableCell>
                  </TableRow>
                ) : (
                  lots.map((lot) => (
                    <TableRow key={`${lot.id}-full`}>
                      <TableCell className="font-medium">
                        {lot.lot_number}
                      </TableCell>
                      <TableCell>
                        {lot.expiration_date
                          ? formatDateTime(lot.expiration_date)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {lot.quantity_available.toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-right">
                        {renderStatus(lot)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
