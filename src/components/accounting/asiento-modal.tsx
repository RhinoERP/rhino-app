"use client";

import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Loader2,
  PartyPopper,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type AccountingEventSubmitOptions,
  confirmAccountingEvent,
  createInformalEntry,
  previewAccountingEvent,
} from "@/lib/accounting-client";
import { useCuentas } from "@/modules/accounting/queries/queries.client";
import type {
  AnyEvento,
  PreviewResponse,
  ResolvedLine,
} from "@/modules/accounting/types";

type Moneda = "ARS" | "USD";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type AsientoModalProps = {
  mode: "gate";
  eventoPayload: AnyEvento;
  open: boolean;
  persistAs?: "formal" | "informal";
  sourceType?: "NOTA_DE_VENTA" | "FACTURA_PENDIENTE";
  onConfirm: (entryId: string) => void;
  onCancel: () => void;
};

type ExtraLinea = {
  id: string;
  lado: "DEBE" | "HABER";
  cuentaId: string;
  montoStr: string;
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

let _extraId = 0;
function nextId() {
  _extraId += 1;
  return String(_extraId);
}

function parseNum(s: string): number {
  return Number.parseFloat(s.replace(",", ".")) || 0;
}

function fmtMonto(n: number, moneda: Moneda = "ARS"): string {
  return (
    new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) + (moneda === "USD" ? " USD" : "")
  );
}

function toARS(monto: number, moneda: Moneda, tipoCambio: number): number {
  return moneda === "USD" ? monto * tipoCambio : monto;
}

// Mock exchange rate â€” TODO: replace with real API (BCRA/Bluelytics)
const MOCK_TIPO_CAMBIO_USD = 1240;

// ------------------------------------------------------------
// BalanceBadge â€” totals across all lines (original + extra)
// ------------------------------------------------------------

type BalanceProps = {
  lineas: ResolvedLine[];
  montoOverrides: Record<number, string>;
  assignments: Record<number, string>;
  extraLineas: ExtraLinea[];
  moneda: Moneda;
  tipoCambio: number;
};

function accumLineas(
  lineas: ResolvedLine[],
  overrides: {
    montoOverrides: Record<number, string>;
    assignments: Record<number, string>;
  },
  convert: { moneda: Moneda; tipoCambio: number }
): { debe: number; haber: number } {
  let debe = 0;
  let haber = 0;
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (!l) {
      continue;
    }
    if (l.esSeleccionable && !overrides.assignments[i]) {
      continue;
    }
    const ars = toARS(
      parseNum(overrides.montoOverrides[i] ?? l.monto),
      convert.moneda,
      convert.tipoCambio
    );
    if (l.lado === "DEBE") {
      debe += ars;
    } else {
      haber += ars;
    }
  }
  return { debe, haber };
}

function accumExtras(
  extraLineas: ExtraLinea[],
  moneda: Moneda,
  tipoCambio: number
): { debe: number; haber: number } {
  let debe = 0;
  let haber = 0;
  for (const ex of extraLineas) {
    if (!ex.cuentaId) {
      continue;
    }
    const ars = toARS(parseNum(ex.montoStr), moneda, tipoCambio);
    if (ex.lado === "DEBE") {
      debe += ars;
    } else {
      haber += ars;
    }
  }
  return { debe, haber };
}

function calcTotales(props: BalanceProps): { debe: number; haber: number } {
  const {
    lineas,
    montoOverrides,
    assignments,
    extraLineas,
    moneda,
    tipoCambio,
  } = props;
  const a = accumLineas(
    lineas,
    { montoOverrides, assignments },
    { moneda, tipoCambio }
  );
  const b = accumExtras(extraLineas, moneda, tipoCambio);
  return { debe: a.debe + b.debe, haber: a.haber + b.haber };
}

function BalanceBadge(props: BalanceProps) {
  const { debe, haber } = calcTotales(props);

  const diff = debe - haber;
  const balanced = Math.abs(diff) < 0.01;
  const Icon = balanced ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm ${
        balanced
          ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400"
          : "border-destructive/30 bg-destructive/5 text-destructive"
      }`}
    >
      <div className="flex items-center gap-2 font-medium">
        <Icon className="size-4" />
        <span>{balanced ? "Asiento balanceado" : "Asiento desbalanceado"}</span>
      </div>
      <div className="flex items-center gap-6 font-mono text-xs">
        <span>
          <span className="mr-1 font-normal font-sans text-muted-foreground">
            DEBE
          </span>
          {fmtMonto(debe)}
        </span>
        <span>
          <span className="mr-1 font-normal font-sans text-muted-foreground">
            HABER
          </span>
          {fmtMonto(haber)}
        </span>
        {!balanced && (
          <span className="font-semibold text-destructive">
            <span className="mr-1 font-normal font-sans">Δ</span>
            {fmtMonto(Math.abs(diff))}
          </span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// LineRow â€” fila existente (del preview)
// ------------------------------------------------------------

type LineRowProps = {
  cuentas: Array<{ id: string; codigo: string; nombre: string }>;
  line: ResolvedLine;
  index: number;
  assignedCuentaId: string | undefined;
  montoOverride: string | undefined;
  onAssign: (index: number, cuentaId: string) => void;
  onMontoChange: (index: number, val: string) => void;
  moneda: Moneda;
  tipoCambio: number;
};

function LineRow({
  cuentas,
  line,
  index,
  assignedCuentaId,
  montoOverride,
  onAssign,
  onMontoChange,
  moneda,
  tipoCambio,
}: LineRowProps) {
  const rawMonto = parseNum(montoOverride ?? line.monto);
  const arsAmount = toARS(rawMonto, moneda, tipoCambio);

  const ladoBadge = (
    <Badge
      className="text-xs"
      variant={line.lado === "DEBE" ? "default" : "secondary"}
    >
      {line.lado}
    </Badge>
  );

  const montoCell = (
    <TableCell className="w-48">
      <div className="flex flex-col items-end gap-0.5">
        <Input
          className="h-7 w-full text-right font-mono text-xs"
          min={0}
          onChange={(e) => onMontoChange(index, e.target.value)}
          step={0.01}
          type="number"
          value={montoOverride ?? line.monto}
        />
        {moneda === "USD" && (
          <span className="text-muted-foreground text-xs">
            = {fmtMonto(arsAmount)} ARS
          </span>
        )}
      </div>
    </TableCell>
  );

  const selectedCuenta =
    cuentas.find((cuenta) => cuenta.id === assignedCuentaId) ?? null;

  return (
    <TableRow>
      <TableCell>{ladoBadge}</TableCell>
      <TableCell className="font-mono text-muted-foreground text-xs">
        {selectedCuenta?.codigo ?? line.cuentaCodigoInterno ?? "-"}
      </TableCell>
      <TableCell className="min-w-[160px]">
        <Select
          onValueChange={(v) => onAssign(index, v)}
          value={assignedCuentaId ?? ""}
        >
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue placeholder="Seleccionar cuenta..." />
          </SelectTrigger>
          <SelectContent>
            {cuentas.map((cuenta) => (
              <SelectItem key={cuenta.id} value={cuenta.id}>
                <span className="mr-2 font-mono text-muted-foreground text-xs">
                  {cuenta.codigo}
                </span>
                {cuenta.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      {montoCell}
      <TableCell className="w-8" />
    </TableRow>
  );
}

// ------------------------------------------------------------
// ExtraLineRow â€” nueva linea manual
// ------------------------------------------------------------

type ExtraLineRowProps = {
  linea: ExtraLinea;
  cuentas: Array<{ id: string; codigo: string; nombre: string }>;
  moneda: Moneda;
  tipoCambio: number;
  onChange: (id: string, patch: Partial<ExtraLinea>) => void;
  onRemove: (id: string) => void;
};

function ExtraLineRow({
  linea,
  cuentas,
  moneda,
  tipoCambio,
  onChange,
  onRemove,
}: ExtraLineRowProps) {
  const arsAmount = toARS(parseNum(linea.montoStr), moneda, tipoCambio);
  const selected = cuentas.find((c) => c.id === linea.cuentaId);

  return (
    <TableRow className="bg-muted/20">
      <TableCell>
        <Select
          onValueChange={(v) =>
            onChange(linea.id, { lado: v as "DEBE" | "HABER" })
          }
          value={linea.lado}
        >
          <SelectTrigger className="h-7 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DEBE">DEBE</SelectItem>
            <SelectItem value="HABER">HABER</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="font-mono text-muted-foreground text-xs">
        {selected?.codigo ?? "-"}
      </TableCell>
      <TableCell className="min-w-[160px]">
        <Select
          onValueChange={(v) => onChange(linea.id, { cuentaId: v })}
          value={linea.cuentaId}
        >
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue placeholder="Seleccionar cuenta..." />
          </SelectTrigger>
          <SelectContent>
            {cuentas.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="mr-2 font-mono text-muted-foreground text-xs">
                  {c.codigo}
                </span>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="w-48">
        <div className="flex flex-col items-end gap-0.5">
          <Input
            className="h-7 w-full text-right font-mono text-xs"
            min={0}
            onChange={(e) => onChange(linea.id, { montoStr: e.target.value })}
            step={0.01}
            type="number"
            value={linea.montoStr}
          />
          {moneda === "USD" && (
            <span className="text-muted-foreground text-xs">
              = {fmtMonto(arsAmount)} ARS
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="w-8">
        <Button
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(linea.id)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// ------------------------------------------------------------
// AsientoModal â€” componente principal
// ------------------------------------------------------------

export function AsientoModal(props: AsientoModalProps) {
  const { open, onConfirm, onCancel } = props;

  type Phase = "loading" | "preview" | "error" | "success";
  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [montoOverrides, setMontoOverrides] = useState<Record<number, string>>(
    {}
  );
  const [extraLineas, setExtraLineas] = useState<ExtraLinea[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmedAsientoId, setConfirmedAsientoId] = useState<string | null>(
    null
  );

  // Currency
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [tipoCambioStr, setTipoCambioStr] = useState(
    String(MOCK_TIPO_CAMBIO_USD)
  );
  const tipoCambio = parseNum(tipoCambioStr) || MOCK_TIPO_CAMBIO_USD;

  // Accounts list for extra-line selector
  const { data: cuentas = [] } = useCuentas(props.eventoPayload.orgId);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPhase("loading");
    setPreview(null);
    setAssignments({});
    setMontoOverrides({});
    setExtraLineas([]);
    setError(null);
    setConfirming(false);
    setConfirmedAsientoId(null);
    setMoneda("ARS");
    setTipoCambioStr(String(MOCK_TIPO_CAMBIO_USD));

    previewAccountingEvent(props.eventoPayload)
      .then((p) => {
        const initialAssignments = Object.fromEntries(
          p.lineas
            .map((line, index) =>
              line.cuentaId ? ([index, line.cuentaId] as const) : null
            )
            .filter(
              (entry): entry is readonly [number, string] => entry !== null
            )
        );
        const initialMontos = Object.fromEntries(
          p.lineas.map((line, index) => [index, line.monto])
        );

        if (p.lineas.some((line) => !line.cuentaId)) {
          console.warn("Accounting preview contains unassigned lines", {
            referenciaId: props.eventoPayload.referenciaId,
            tipoEvento: props.eventoPayload.tipoEvento,
            lineas: p.lineas,
          });
        }

        setPreview(p);
        setAssignments(initialAssignments);
        setMontoOverrides(initialMontos);
        setPhase("preview");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Error al cargar preview");
        setPhase("error");
      });
  }, [open, props.eventoPayload]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAssign(index: number, cuentaId: string) {
    setAssignments((prev) => ({ ...prev, [index]: cuentaId }));
  }

  function handleMontoChange(index: number, val: string) {
    setMontoOverrides((prev) => ({ ...prev, [index]: val }));
  }

  function handleExtraChange(id: string, patch: Partial<ExtraLinea>) {
    setExtraLineas((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
  }

  function handleExtraRemove(id: string) {
    setExtraLineas((prev) => prev.filter((l) => l.id !== id));
  }

  function addExtraLinea() {
    setExtraLineas((prev) => [
      ...prev,
      { id: nextId(), lado: "DEBE", cuentaId: "", montoStr: "0" },
    ]);
  }

  function allAssigned(): boolean {
    if (!preview) {
      return false;
    }
    return preview.lineas.every((_, i) => Boolean(assignments[i]));
  }

  function extrasAreValid(): boolean {
    return extraLineas.every(
      (linea) => Boolean(linea.cuentaId) && parseNum(linea.montoStr) > 0
    );
  }

  function isBalanced(): boolean {
    if (!preview) {
      return false;
    }

    const { debe, haber } = calcTotales({
      lineas: preview.lineas,
      montoOverrides,
      assignments,
      extraLineas,
      moneda,
      tipoCambio,
    });

    return Math.abs(debe - haber) < 0.01;
  }

  function buildSubmitOptions(): AccountingEventSubmitOptions {
    return {
      lineasEditadas:
        preview?.lineas.map((line, index) => ({
          index,
          cuentaId: assignments[index],
          monto: montoOverrides[index] ?? line.monto,
        })) ?? [],
      lineasManuales: extraLineas
        .filter(
          (linea) => Boolean(linea.cuentaId) && parseNum(linea.montoStr) > 0
        )
        .map((linea) => ({
          lado: linea.lado,
          cuentaId: linea.cuentaId,
          monto: linea.montoStr,
        })),
    };
  }

  async function handleConfirm() {
    if (!preview) {
      return;
    }
    setConfirming(true);
    try {
      const submitOptions = buildSubmitOptions();
      const entryId =
        props.persistAs === "informal"
          ? await createInformalEntry(
              props.eventoPayload,
              props.sourceType ?? "FACTURA_PENDIENTE",
              submitOptions
            )
          : await confirmAccountingEvent(props.eventoPayload, submitOptions);
      setConfirmedAsientoId(entryId);
      setPhase("success");
      setTimeout(() => onConfirm(entryId), 1800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al confirmar");
      setPhase("error");
      setConfirming(false);
    }
  }

  const canConfirm =
    allAssigned() && extrasAreValid() && isBalanced() && !confirming;

  return (
    <Dialog
      onOpenChange={(v) => {
        if (!v) {
          onCancel();
        }
      }}
      open={open}
    >
      <DialogContent
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden sm:max-w-3xl"
        onFocusOutside={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>Confirmar asiento contable</DialogTitle>
          <DialogDescription>
            Revise la previsualizacion del asiento y confirme su registracion.
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {phase === "loading" && (
          <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-sm">Cargando asiento...</span>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="flex h-40 flex-col items-center justify-center gap-3">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-center font-medium text-destructive text-sm">
              No se pudo generar el asiento
            </p>
            <p className="max-w-sm text-center text-muted-foreground text-xs">
              {error}
            </p>
            <Button
              onClick={() => {
                setPhase("preview");
                setError(null);
                setConfirming(false);
              }}
              size="sm"
              variant="outline"
            >
              Reintentar
            </Button>
          </div>
        )}

        {/* Success */}
        {phase === "success" && (
          <div className="flex h-44 flex-col items-center justify-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-full bg-green-100">
              <PartyPopper className="size-7 text-green-600" />
            </div>
            <p className="font-semibold text-base text-green-700">
              Asiento registrado
            </p>
            {confirmedAsientoId && (
              <p className="font-mono text-muted-foreground text-xs">
                ID: {confirmedAsientoId.slice(0, 8)}...
              </p>
            )}
            <p className="text-muted-foreground text-xs">Redirigiendo...</p>
          </div>
        )}

        {/* Preview */}
        {phase === "preview" && preview && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            {/* Currency bar */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/40 px-4 py-3">
              <DollarSign className="size-4 text-muted-foreground" />
              <div className="flex items-center gap-2">
                <Label className="font-medium text-sm">Moneda</Label>
                <Select
                  onValueChange={(v) => setMoneda(v as Moneda)}
                  value={moneda}
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ARS">ARS $</SelectItem>
                    <SelectItem value="USD">USD $</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {moneda === "USD" && (
                <>
                  <div className="flex items-center gap-2">
                    <Label className="text-muted-foreground text-sm">
                      1 USD =
                    </Label>
                    <Input
                      className="h-8 w-28"
                      min={1}
                      onChange={(e) => setTipoCambioStr(e.target.value)}
                      step={0.01}
                      type="number"
                      value={tipoCambioStr}
                    />
                    <span className="text-muted-foreground text-sm">ARS</span>
                  </div>
                  <Badge
                    className="ml-auto border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    variant="outline"
                  >
                    Cotización mock
                  </Badge>
                </>
              )}
            </div>

            <Separator />

            <Table className="w-full table-fixed">
              <colgroup>
                <col className="w-20" />
                <col className="w-24" />
                <col />
                <col className="w-44" />
                <col className="w-8" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>Lado</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="text-right">
                    {moneda === "USD" ? "Monto USD" : "Monto ARS"}
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.lineas.map((line, i) => (
                  <LineRow
                    assignedCuentaId={assignments[i]}
                    cuentas={cuentas}
                    index={i}
                    key={`orig-${line.lado}-${line.cuentaId ?? "sel"}-${line.monto}`}
                    line={line}
                    moneda={moneda}
                    montoOverride={montoOverrides[i]}
                    onAssign={handleAssign}
                    onMontoChange={handleMontoChange}
                    tipoCambio={tipoCambio}
                  />
                ))}
                {extraLineas.map((ex) => (
                  <ExtraLineRow
                    cuentas={cuentas}
                    key={ex.id}
                    linea={ex}
                    moneda={moneda}
                    onChange={handleExtraChange}
                    onRemove={handleExtraRemove}
                    tipoCambio={tipoCambio}
                  />
                ))}
                {/* Add line row */}
                <TableRow>
                  <TableCell className="py-1.5" colSpan={5}>
                    <Button
                      className="h-7 gap-1.5 text-muted-foreground text-xs hover:text-foreground"
                      onClick={addExtraLinea}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Plus className="size-3.5" />
                      Agregar linea manual
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <BalanceBadge
              assignments={assignments}
              extraLineas={extraLineas}
              lineas={preview.lineas}
              moneda={moneda}
              montoOverrides={montoOverrides}
              tipoCambio={tipoCambio}
            />
          </div>
        )}

        <DialogFooter>
          {phase !== "success" && (
            <Button disabled={confirming} onClick={onCancel} variant="outline">
              Cancelar
            </Button>
          )}
          {phase !== "success" && phase !== "error" && (
            <Button
              disabled={!canConfirm || phase !== "preview"}
              onClick={handleConfirm}
            >
              {confirming && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirmar y registrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
