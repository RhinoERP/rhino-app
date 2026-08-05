"use client";

import { AlertCircle, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  AccountingCurrencySelector,
  convertAccountingAmountToArs,
  DEFAULT_TIPO_CAMBIO_USD,
  formatAccountingAmount,
  type Moneda,
  parseAccountingAmount,
} from "@/components/accounting/accounting-currency-selector";
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
import {
  type AccountingEventSubmitOptions,
  cancelInformalEntry,
  confirmAccountingEvent,
  createInformalEntry,
  formalizarEntry,
  previewAccountingEvent,
  toAccountingStr,
} from "@/lib/accounting-client";
import { formatAmountInput, formatNormalizedAmountInput } from "@/lib/amounts";
import { useCuentas } from "@/modules/accounting/queries/queries.client";
import type {
  AnyEvento,
  InformalEntrySourceType,
  PreviewResponse,
  ResolvedLine,
} from "@/modules/accounting/types";

// ------------------------------------------------------------
// Types
// ------------------------------------------------------------

export type AsientoModalProps = {
  mode: "gate";
  eventoPayload: AnyEvento;
  open: boolean;
  persistAs?: "formal" | "informal";
  sourceType?: InformalEntrySourceType;
  resolveInformalEntryId?: string;
  onConfirm: (entryId: string) => void;
  onCancel: () => void;
};

type ExtraLinea = {
  id: string;
  lado: "DEBE" | "HABER";
  cuentaId: string;
  montoStr: string;
};

type CuentaOption = {
  id: string;
  codigo: string;
  nombre: string;
  account_code: string | null;
};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

let _extraId = 0;
function nextId() {
  _extraId += 1;
  return String(_extraId);
}

function deriveFallbackSourceType(
  evento: AnyEvento,
  explicitSourceType?: InformalEntrySourceType
): InformalEntrySourceType | null {
  if (explicitSourceType) {
    return explicitSourceType;
  }

  switch (evento.tipoEvento) {
    case "FACTURA_VENTA":
      return "FACTURA_PENDIENTE";
    case "FACTURA_COMPRA":
      return "COMPRA";
    case "NC_VENTA":
    case "NC_COMPRA":
      return "NOTA_DE_CREDITO";
    default:
      return null;
  }
}

async function registerCancelledFallbackEntry(params: {
  eventoPayload: AnyEvento;
  persistAs?: "formal" | "informal";
  sourceType?: InformalEntrySourceType;
  submitOptions: AccountingEventSubmitOptions;
}) {
  const { eventoPayload, persistAs, sourceType, submitOptions } = params;

  if (persistAs !== "formal") {
    return;
  }

  const fallbackSourceType = deriveFallbackSourceType(
    eventoPayload,
    sourceType
  );

  if (!fallbackSourceType) {
    return;
  }

  const informalEntryId = await createInformalEntry(
    eventoPayload,
    fallbackSourceType,
    submitOptions
  );
  await cancelInformalEntry(informalEntryId);
}

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
    const ars = convertAccountingAmountToArs(
      parseAccountingAmount(overrides.montoOverrides[i] ?? l.monto),
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
    const ars = convertAccountingAmountToArs(
      parseAccountingAmount(ex.montoStr),
      moneda,
      tipoCambio
    );
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

function getLineAccountOptions(
  cuentas: CuentaOption[],
  line: ResolvedLine
): CuentaOption[] {
  if (!line.esSeleccionable) {
    return cuentas;
  }

  const configuredOptions = line.opcionesCuenta ?? [];
  const allowedAccountCodes = new Set(
    configuredOptions.map((option) => option.accountCode)
  );

  return cuentas.filter(
    (cuenta) =>
      cuenta.account_code !== null &&
      allowedAccountCodes.has(cuenta.account_code)
  );
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
          {formatAccountingAmount(debe)}
        </span>
        <span>
          <span className="mr-1 font-normal font-sans text-muted-foreground">
            HABER
          </span>
          {formatAccountingAmount(haber)}
        </span>
        {!balanced && (
          <span className="font-semibold text-destructive">
            <span className="mr-1 font-normal font-sans">Δ</span>
            {formatAccountingAmount(Math.abs(diff))}
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
  cuentas: CuentaOption[];
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
  const rawMonto = parseAccountingAmount(montoOverride ?? line.monto);
  const arsAmount = convertAccountingAmountToArs(rawMonto, moneda, tipoCambio);

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
          inputMode="decimal"
          onChange={(e) => onMontoChange(index, e.target.value)}
          placeholder="0,00"
          type="text"
          value={
            montoOverride === undefined
              ? formatNormalizedAmountInput(line.monto)
              : formatAmountInput(montoOverride)
          }
        />
        {moneda === "USD" && (
          <span className="text-muted-foreground text-xs">
            = {formatAccountingAmount(arsAmount)} ARS
          </span>
        )}
      </div>
    </TableCell>
  );

  const selectedCuenta =
    cuentas.find((cuenta) => cuenta.id === assignedCuentaId) ?? null;
  const accountOptions = getLineAccountOptions(cuentas, line);

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
            {accountOptions.length === 0 && (
              <div className="px-2 py-1.5 text-muted-foreground text-xs">
                Sin cuentas configuradas para esta regla
              </div>
            )}
            {accountOptions.map((cuenta) => (
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
  cuentas: CuentaOption[];
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
  const arsAmount = convertAccountingAmountToArs(
    parseAccountingAmount(linea.montoStr),
    moneda,
    tipoCambio
  );
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
            inputMode="decimal"
            onChange={(e) =>
              onChange(linea.id, {
                montoStr: formatAmountInput(e.target.value),
              })
            }
            placeholder="0,00"
            type="text"
            value={formatAmountInput(linea.montoStr)}
          />
          {moneda === "USD" && (
            <span className="text-muted-foreground text-xs">
              = {formatAccountingAmount(arsAmount)} ARS
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

  // Currency
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [tipoCambioStr, setTipoCambioStr] = useState(
    String(DEFAULT_TIPO_CAMBIO_USD)
  );
  const tipoCambio =
    parseAccountingAmount(tipoCambioStr) || DEFAULT_TIPO_CAMBIO_USD;

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
    setMoneda("ARS");
    setTipoCambioStr(formatAmountInput(String(DEFAULT_TIPO_CAMBIO_USD)));

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
          p.lineas.map((line, index) => [
            index,
            formatNormalizedAmountInput(line.monto),
          ])
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
    setMontoOverrides((prev) => ({
      ...prev,
      [index]: formatAmountInput(val),
    }));
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
      (linea) =>
        Boolean(linea.cuentaId) && parseAccountingAmount(linea.montoStr) > 0
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
          monto: toAccountingStr(
            convertAccountingAmountToArs(
              parseAccountingAmount(montoOverrides[index] ?? line.monto),
              moneda,
              tipoCambio
            )
          ),
        })) ?? [],
      lineasManuales: extraLineas
        .filter(
          (linea) =>
            Boolean(linea.cuentaId) && parseAccountingAmount(linea.montoStr) > 0
        )
        .map((linea) => ({
          lado: linea.lado,
          cuentaId: linea.cuentaId,
          monto: toAccountingStr(
            convertAccountingAmountToArs(
              parseAccountingAmount(linea.montoStr),
              moneda,
              tipoCambio
            )
          ),
        })),
    };
  }

  function persistAccountingEntry(submitOptions: AccountingEventSubmitOptions) {
    if (props.resolveInformalEntryId) {
      return formalizarEntry(props.resolveInformalEntryId, submitOptions);
    }

    if (props.persistAs === "informal") {
      return createInformalEntry(
        props.eventoPayload,
        props.sourceType ?? "FACTURA_PENDIENTE",
        submitOptions
      );
    }

    return confirmAccountingEvent(props.eventoPayload, submitOptions);
  }

  async function handleConfirm() {
    if (!preview) {
      return;
    }

    setConfirming(true);

    const submitOptions = buildSubmitOptions();

    try {
      const entryId = await persistAccountingEntry(submitOptions);
      setPhase("success");
      setTimeout(() => onConfirm(entryId), 1800);
    } catch (e: unknown) {
      try {
        await registerCancelledFallbackEntry({
          eventoPayload: props.eventoPayload,
          persistAs: props.persistAs,
          sourceType: props.sourceType,
          submitOptions,
        });
      } catch (fallbackError) {
        console.error(
          "No se pudo registrar el asiento informal cancelado tras el error de confirmación",
          fallbackError
        );
      }

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
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden sm:max-w-5xl"
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
          <DialogTitle>
            {phase === "success"
              ? "Asiento contable registrado"
              : "Revisar asiento contable"}
          </DialogTitle>
          <DialogDescription>
            {phase === "success"
              ? "El registro se completó correctamente."
              : "Revisá la imputación propuesta por el flujo antes de confirmar el registro contable."}
          </DialogDescription>
        </DialogHeader>

        {/* Loading */}
        {phase === "loading" && (
          <div className="flex h-36 items-center justify-center gap-3 rounded-md border bg-muted/10 px-6 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Cargando asiento...</span>
          </div>
        )}

        {/* Error */}
        {phase === "error" && (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-md border border-destructive/20 bg-background px-6">
            <AlertCircle className="size-6 text-destructive" />
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
          <div className="flex min-h-40 flex-col items-center justify-center gap-4 rounded-md border bg-muted/10 px-6 py-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border bg-background">
              <CheckCircle2 className="size-5 text-emerald-700" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-base">
                El asiento fue registrado correctamente.
              </p>
              <p className="text-muted-foreground text-sm">
                La operación contable quedó confirmada.
              </p>
            </div>
          </div>
        )}

        {/* Preview */}
        {phase === "preview" && preview && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
            <AccountingCurrencySelector
              moneda={moneda}
              onMonedaChange={setMoneda}
              onTipoCambioChange={setTipoCambioStr}
              tipoCambioStr={tipoCambioStr}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-sm">Líneas contables</h3>
                  <p className="text-muted-foreground text-xs">
                    Ajustá cuentas y montos antes de confirmar el asiento.
                  </p>
                </div>
                <Button
                  onClick={addExtraLinea}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="mr-2 size-4" />
                  Agregar línea
                </Button>
              </div>

              <div className="rounded-md border">
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
                  </TableBody>
                </Table>
              </div>
            </div>

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
