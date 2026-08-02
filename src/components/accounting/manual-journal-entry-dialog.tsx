"use client";

import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AccountingCurrencySelector,
  convertAccountingAmountToArs,
  DEFAULT_TIPO_CAMBIO_USD,
  formatAccountingAmount,
  type Moneda,
  parseAccountingAmount,
} from "@/components/accounting/accounting-currency-selector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Textarea } from "@/components/ui/textarea";
import { toAccountingStr } from "@/lib/accounting-client";
import { formatAmountInput } from "@/lib/amounts";
import { formatCurrency } from "@/lib/format";
import { useCreateManualJournalEntry } from "@/modules/accounting/hooks/use-create-manual-journal-entry";
import { useCuentas } from "@/modules/accounting/queries/queries.client";

type ManualJournalEntryDialogProps = {
  open: boolean;
  orgId: string;
  onOpenChange: (open: boolean) => void;
};

type ManualEntryLineDraft = {
  id: string;
  cuentaId: string;
  lado: "DEBE" | "HABER";
  monto: string;
};

let fallbackLineId = 0;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  fallbackLineId += 1;
  return `manual-line-${fallbackLineId}`;
}

function createEmptyLine(
  lado: "DEBE" | "HABER" = "DEBE"
): ManualEntryLineDraft {
  return {
    id: nextLineId(),
    cuentaId: "",
    lado,
    monto: "",
  };
}

function normalizeDescription(
  description: string,
  referenciaLibre: string
): string {
  return referenciaLibre.trim()
    ? `${description.trim()} · Ref: ${referenciaLibre.trim()}`
    : description.trim();
}

export function ManualJournalEntryDialog({
  open,
  orgId,
  onOpenChange,
}: ManualJournalEntryDialogProps) {
  const { data: cuentas = [], isLoading: isLoadingCuentas } = useCuentas(orgId);
  const createEntry = useCreateManualJournalEntry();
  const [fecha, setFecha] = useState(today());
  const [descripcion, setDescripcion] = useState("");
  const [referenciaLibre, setReferenciaLibre] = useState("");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [tipoCambioStr, setTipoCambioStr] = useState(
    String(DEFAULT_TIPO_CAMBIO_USD)
  );
  const tipoCambio =
    parseAccountingAmount(tipoCambioStr) || DEFAULT_TIPO_CAMBIO_USD;
  const [lineas, setLineas] = useState<ManualEntryLineDraft[]>([
    createEmptyLine("DEBE"),
    createEmptyLine("HABER"),
  ]);

  useEffect(() => {
    if (open) {
      return;
    }

    setFecha(today());
    setDescripcion("");
    setReferenciaLibre("");
    setMoneda("ARS");
    setTipoCambioStr(formatAmountInput(String(DEFAULT_TIPO_CAMBIO_USD)));
    setLineas([createEmptyLine("DEBE"), createEmptyLine("HABER")]);
  }, [open]);

  const totales = useMemo(
    () =>
      lineas.reduce(
        (acc, linea) => {
          const amount = parseAccountingAmount(linea.monto);
          if (linea.lado === "DEBE") {
            acc.debe += amount;
          } else {
            acc.haber += amount;
          }
          return acc;
        },
        { debe: 0, haber: 0 }
      ),
    [lineas]
  );

  const hasValidLines =
    lineas.length >= 2 &&
    lineas.every(
      (linea) =>
        Boolean(linea.cuentaId) && parseAccountingAmount(linea.monto) > 0
    );
  const isBalanced = Math.abs(totales.debe - totales.haber) < 0.0001;
  const totalesArs = useMemo(
    () => ({
      debe: convertAccountingAmountToArs(totales.debe, moneda, tipoCambio),
      haber: convertAccountingAmountToArs(totales.haber, moneda, tipoCambio),
    }),
    [moneda, tipoCambio, totales.debe, totales.haber]
  );
  const canSubmit =
    Boolean(fecha) &&
    Boolean(descripcion.trim()) &&
    hasValidLines &&
    isBalanced &&
    !createEntry.isPending;

  const updateLine = (
    lineId: string,
    field: keyof Omit<ManualEntryLineDraft, "id">,
    value: string
  ) => {
    setLineas((current) =>
      current.map((linea) =>
        linea.id === lineId ? { ...linea, [field]: value } : linea
      )
    );
  };

  const addLine = () => {
    setLineas((current) => [...current, createEmptyLine("DEBE")]);
  };

  const removeLine = (lineId: string) => {
    setLineas((current) => {
      if (current.length <= 2) {
        return current;
      }

      return current.filter((linea) => linea.id !== lineId);
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error(
        "Completá fecha, descripción, cuentas y montos, y verificá que Debe y Haber coincidan."
      );
      return;
    }

    try {
      await createEntry.mutateAsync({
        orgId,
        fecha,
        descripcion: descripcion.trim(),
        referenciaLibre: referenciaLibre.trim() || undefined,
        moneda,
        tipoCambio: moneda === "USD" ? tipoCambio : undefined,
        lineas: lineas.map((linea) => ({
          lado: linea.lado,
          cuentaId: linea.cuentaId,
          monto: toAccountingStr(
            convertAccountingAmountToArs(
              parseAccountingAmount(linea.monto),
              moneda,
              tipoCambio
            )
          ),
        })),
      });
      toast.success("Asiento manual cargado correctamente.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el asiento manual."
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Nuevo asiento manual</DialogTitle>
          <DialogDescription>
            Cargá un asiento contable manual y publicalo directamente en el
            Libro Diario.
          </DialogDescription>
        </DialogHeader>

        <AccountingCurrencySelector
          moneda={moneda}
          onMonedaChange={setMoneda}
          onTipoCambioChange={setTipoCambioStr}
          tipoCambioStr={formatAmountInput(tipoCambioStr)}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="manual-entry-date">Fecha</Label>
            <Input
              id="manual-entry-date"
              onChange={(event) => setFecha(event.target.value)}
              type="date"
              value={fecha}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="manual-entry-reference">Referencia libre</Label>
            <Input
              id="manual-entry-reference"
              maxLength={120}
              onChange={(event) => setReferenciaLibre(event.target.value)}
              placeholder="Ej: Ajuste de cierre"
              value={referenciaLibre}
            />
          </div>
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor="manual-entry-description">Descripción</Label>
            <Textarea
              id="manual-entry-description"
              maxLength={500}
              onChange={(event) => setDescripcion(event.target.value)}
              placeholder="Detalle del asiento"
              value={descripcion}
            />
            <p className="text-muted-foreground text-xs">
              Se guardará como:{" "}
              {normalizeDescription(
                descripcion || "Asiento manual",
                referenciaLibre
              )}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-sm">Líneas contables</h3>
              <p className="text-muted-foreground text-xs">
                Cada línea requiere cuenta, lado y monto.
              </p>
            </div>
            <Button onClick={addLine} size="sm" type="button" variant="outline">
              <Plus className="mr-2 size-4" />
              Agregar línea
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead className="w-36">Lado</TableHead>
                  <TableHead className="w-40 text-right">
                    {moneda === "USD" ? "Monto USD" : "Monto ARS"}
                  </TableHead>
                  <TableHead className="w-16 text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((linea) => (
                  <TableRow key={linea.id}>
                    <TableCell>
                      <Select
                        onValueChange={(value) =>
                          updateLine(linea.id, "cuentaId", value)
                        }
                        value={linea.cuentaId || undefined}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Seleccionar cuenta" />
                        </SelectTrigger>
                        <SelectContent>
                          {cuentas.map((cuenta) => (
                            <SelectItem key={cuenta.id} value={cuenta.id}>
                              {cuenta.codigo} - {cuenta.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        onValueChange={(value) =>
                          updateLine(linea.id, "lado", value)
                        }
                        value={linea.lado}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DEBE">Debe</SelectItem>
                          <SelectItem value="HABER">Haber</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-0.5">
                        <Input
                          className="text-right font-mono"
                          inputMode="decimal"
                          onChange={(event) =>
                            updateLine(
                              linea.id,
                              "monto",
                              formatAmountInput(event.target.value)
                            )
                          }
                          placeholder="0,00"
                          value={formatAmountInput(linea.monto)}
                        />
                        {moneda === "USD" ? (
                          <span className="text-muted-foreground text-xs">
                            ={" "}
                            {formatAccountingAmount(
                              convertAccountingAmountToArs(
                                parseAccountingAmount(linea.monto),
                                moneda,
                                tipoCambio
                              )
                            )}{" "}
                            ARS
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        disabled={lineas.length <= 2}
                        onClick={() => removeLine(linea.id)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-6 rounded-md bg-muted/30 px-3 py-2 text-sm">
            <span>
              Debe:{" "}
              <strong>{formatAccountingAmount(totales.debe, moneda)}</strong>
            </span>
            <span>
              Haber:{" "}
              <strong>{formatAccountingAmount(totales.haber, moneda)}</strong>
            </span>
            <span
              className={isBalanced ? "text-emerald-700" : "text-destructive"}
            >
              {isBalanced ? "Balanceado" : "Desbalanceado"}
            </span>
          </div>
          {moneda === "USD" ? (
            <div className="flex flex-wrap items-center justify-end gap-6 rounded-md border border-dashed bg-muted/10 px-3 py-2 text-muted-foreground text-xs">
              <span>Debe ARS: {formatCurrency(totalesArs.debe)}</span>
              <span>Haber ARS: {formatCurrency(totalesArs.haber)}</span>
            </div>
          ) : null}
          {isLoadingCuentas ? (
            <p className="text-muted-foreground text-sm">
              Cargando cuentas contables...
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancelar
          </Button>
          <Button disabled={!canSubmit} onClick={handleSubmit} type="button">
            {createEntry.isPending ? "Guardando..." : "Guardar asiento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
