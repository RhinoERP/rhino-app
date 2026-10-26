"use client";

import { ClockIcon, PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { IssuedCheckFormDialog } from "@/components/treasury/issued-check-form-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  IssuedCheckEstado,
  ReceivedCheckEstado,
} from "@/lib/accounting-client";
import { formatCurrency } from "@/lib/format";
import {
  debitarChequeEmitidoAction,
  rechazarChequeEmitidoAction,
  rechazarChequeRecibidoAction,
} from "@/modules/treasury/actions/checks.action";
import {
  useChequesEmitidos,
  useChequesRecibidos,
} from "@/modules/treasury/queries/queries.client";
import { CheckDepositSlipDialog } from "./check-deposit-slip-dialog";
import { ReceivedCheckFormDialog } from "./received-check-form-dialog";

// ── Estado badges ─────────────────────────────────────────────────────────────

const RECEIVED_BADGE: Record<ReceivedCheckEstado, string> = {
  EN_CARTERA: "bg-blue-100 text-blue-800",
  DEPOSITADO: "bg-green-100 text-green-800",
  ENDOSADO: "bg-amber-100 text-amber-800",
  RECHAZADO: "bg-red-100 text-red-800",
  ANULADO: "bg-gray-100 text-gray-800",
};

const ISSUED_BADGE: Record<IssuedCheckEstado, string> = {
  EMITIDO: "bg-yellow-100 text-yellow-800",
  DEBITADO: "bg-green-100 text-green-800",
  RECHAZADO: "bg-red-100 text-red-800",
  ANULADO: "bg-gray-100 text-gray-800",
};

const ALL_ESTADOS = "TODOS";

function formatEstado(estado: string): string {
  return estado.replaceAll("_", " ");
}

function EstadoFilter<T extends string>({
  estados,
  value,
  onChange,
}: {
  estados: readonly T[];
  value: T | typeof ALL_ESTADOS;
  onChange: (value: T | typeof ALL_ESTADOS) => void;
}) {
  return (
    <Select
      onValueChange={(next) => onChange(next as T | typeof ALL_ESTADOS)}
      value={value}
    >
      <SelectTrigger
        aria-label="Filtrar por estado"
        className="h-8 w-44 text-xs"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_ESTADOS}>Todos los estados</SelectItem>
        {estados.map((estado) => (
          <SelectItem key={estado} value={estado}>
            {formatEstado(estado)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const RECEIVED_ESTADOS: readonly ReceivedCheckEstado[] = [
  "EN_CARTERA",
  "DEPOSITADO",
  "ENDOSADO",
  "RECHAZADO",
  "ANULADO",
];

const ISSUED_ESTADOS: readonly IssuedCheckEstado[] = [
  "EMITIDO",
  "DEBITADO",
  "RECHAZADO",
  "ANULADO",
];

// El scroll vive en este contenedor para que el encabezado quede fijo.
const TABLE_SCROLL_AREA =
  "min-h-0 flex-1 overflow-auto rounded-md border [&_[data-slot=table-container]]:overflow-visible [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:whitespace-nowrap [&_th]:bg-background [&_th]:shadow-[inset_0_-1px_0_var(--border)]";
const TABLE_MIN_WIDTH = "min-w-[56rem]";

// ── Vencimientos ────────────────────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const DUE_SOON_DAYS = 7;
const DUE_URGENT_DAYS = 2;

function daysUntil(date: string | undefined): number | null {
  if (!date) {
    return null;
  }
  const target = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(
    `${new Date().toISOString().slice(0, 10)}T00:00:00Z`
  );
  return Math.round((target - today) / MS_PER_DAY);
}

function getDueBadge(
  days: number
): { label: string; className: string } | null {
  if (days < 0) {
    return {
      label: `Vencido hace ${Math.abs(days)} d`,
      className: "bg-red-50 text-red-700 ring-red-200",
    };
  }
  if (days === 0) {
    return {
      label: "Vence hoy",
      className: "bg-red-50 text-red-700 ring-red-200",
    };
  }
  if (days <= DUE_URGENT_DAYS) {
    return {
      label: `Vence en ${days} d`,
      className: "bg-orange-50 text-orange-700 ring-orange-200",
    };
  }
  if (days <= DUE_SOON_DAYS) {
    return {
      label: `Vence en ${days} d`,
      className: "bg-amber-50 text-amber-700 ring-amber-200",
    };
  }
  return null;
}

function DueBadge({
  date,
  isActive,
}: {
  date: string | undefined;
  isActive: boolean;
}) {
  const days = daysUntil(date);
  if (!isActive || days === null) {
    return null;
  }
  const badge = getDueBadge(days);
  if (!badge) {
    return null;
  }
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs ring-1 ring-inset ${badge.className}`}
    >
      <ClockIcon className="h-3 w-3" weight="bold" />
      {badge.label}
    </span>
  );
}
// ── Received checks tab ───────────────────────────────────────────────────────

function ReceivedChecksTab({
  orgId,
  orgSlug,
  onOpenDeposit,
  onOpenNewCheck,
  onSuccess,
}: {
  orgId: string;
  orgSlug: string;
  onOpenDeposit: () => void;
  onOpenNewCheck: () => void;
  onSuccess: () => void;
}) {
  const { data: cheques = [], isLoading } = useChequesRecibidos(orgId);
  const [estadoFilter, setEstadoFilter] = useState<
    ReceivedCheckEstado | typeof ALL_ESTADOS
  >(ALL_ESTADOS);
  const visibleCheques =
    estadoFilter === ALL_ESTADOS
      ? cheques
      : cheques.filter((c) => c.estado === estadoFilter);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rechazarState, setRechazarState] = useState<{
    id: string;
    reabreDeuda: boolean;
  } | null>(null);
  const [, startTransition] = useTransition();

  function handleRechazar(id: string, reabreDeuda: boolean) {
    setRechazarState({ id, reabreDeuda });
  }

  function confirmRechazar() {
    if (!rechazarState) {
      return;
    }
    const { id } = rechazarState;
    setRechazarState(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await rechazarChequeRecibidoAction(orgSlug, id);
      setPendingId(null);
      if (result.success) {
        toast.success("Cheque rechazado");
        onSuccess();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (isLoading) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        Cargando...
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <EstadoFilter
          estados={RECEIVED_ESTADOS}
          onChange={setEstadoFilter}
          value={estadoFilter}
        />
        <Button
          className="gap-1.5"
          onClick={onOpenDeposit}
          size="sm"
          variant="outline"
        >
          Depositar cheques
        </Button>
        <Button className="gap-1.5" onClick={onOpenNewCheck} size="sm">
          <PlusIcon className="h-4 w-4" />
          Cargar cheque
        </Button>
      </div>

      <div className={TABLE_SCROLL_AREA}>
        <Table className={TABLE_MIN_WIDTH}>
          <TableHeader>
            <TableRow>
              <TableHead>N° Cheque</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Banco emisor</TableHead>
              <TableHead>Librador</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleCheques.length === 0 && (
              <TableRow>
                <TableCell
                  className="py-6 text-center text-muted-foreground text-sm"
                  colSpan={8}
                >
                  Sin cheques recibidos
                </TableCell>
              </TableRow>
            )}
            {visibleCheques.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-sm">
                  {c.numero_cheque}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${
                      c.tipo === "ECH"
                        ? "bg-violet-100 text-violet-800"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {c.tipo}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{c.banco_emisor}</TableCell>
                <TableCell className="text-sm">{c.librador ?? "—"}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(Number(c.importe))}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  <div className="flex flex-col items-start gap-1">
                    <span className="whitespace-nowrap">
                      {c.fecha_vencimiento?.slice(0, 10)}
                    </span>
                    <DueBadge
                      date={c.fecha_vencimiento}
                      isActive={c.estado === "EN_CARTERA"}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs ${RECEIVED_BADGE[c.estado]}`}
                  >
                    {formatEstado(c.estado)}
                  </span>
                </TableCell>
                <TableCell>
                  {c.estado === "DEPOSITADO" && (
                    <Button
                      className="h-7 text-xs"
                      disabled={pendingId === c.id}
                      onClick={() =>
                        handleRechazar(c.id, Boolean(c.receivable_payment_id))
                      }
                      size="sm"
                      variant="ghost"
                    >
                      Rechazar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog
        onOpenChange={() => setRechazarState(null)}
        open={rechazarState !== null}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rechazar cheque recibido</DialogTitle>
            <DialogDescription>
              Se registrará el rechazo contra la cuenta bancaria donde se
              depositó el cheque.
            </DialogDescription>
          </DialogHeader>
          {rechazarState?.reabreDeuda && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 text-sm">
              Este cheque proviene de una cobranza. Al rechazarlo se revierte el
              cobro y se reabre la deuda del cliente.
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setRechazarState(null)} variant="outline">
              Cancelar
            </Button>
            <Button onClick={confirmRechazar}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Issued checks tab ─────────────────────────────────────────────────────────

function IssuedChecksTab({
  orgId,
  orgSlug,
  onOpenNewCheck,
}: {
  orgId: string;
  orgSlug: string;
  onOpenNewCheck: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: cheques = [], isLoading } = useChequesEmitidos(orgId);
  const [estadoFilter, setEstadoFilter] = useState<
    IssuedCheckEstado | typeof ALL_ESTADOS
  >(ALL_ESTADOS);
  const visibleCheques =
    estadoFilter === ALL_ESTADOS
      ? cheques
      : cheques.filter((c) => c.estado === estadoFilter);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["treasury"] });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDebitar(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await debitarChequeEmitidoAction(orgSlug, id);
      setPendingId(null);
      if (result.success) {
        toast.success("Cheque marcado como debitado");
        invalidate();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleRechazar(id: string) {
    setPendingId(id);
    startTransition(async () => {
      const result = await rechazarChequeEmitidoAction(orgSlug, id);
      setPendingId(null);
      if (result.success) {
        toast.success("Cheque emitido rechazado");
        invalidate();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (isLoading) {
    return (
      <p className="py-6 text-center text-muted-foreground text-sm">
        Cargando...
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap justify-end gap-2">
        <EstadoFilter
          estados={ISSUED_ESTADOS}
          onChange={setEstadoFilter}
          value={estadoFilter}
        />
        <Button className="gap-1.5" onClick={onOpenNewCheck} size="sm">
          <PlusIcon className="h-4 w-4" />
          Cargar cheque
        </Button>
      </div>

      <div className={TABLE_SCROLL_AREA}>
        <Table className={TABLE_MIN_WIDTH}>
          <TableHeader>
            <TableRow>
              <TableHead>N° Cheque</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Beneficiario</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead>F. Emisión</TableHead>
              <TableHead>F. Débito</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleCheques.length === 0 && (
              <TableRow>
                <TableCell
                  className="py-6 text-center text-muted-foreground text-sm"
                  colSpan={8}
                >
                  Sin cheques emitidos
                </TableCell>
              </TableRow>
            )}
            {visibleCheques.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-sm">
                  {c.numero_cheque}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${
                      c.tipo === "ECH"
                        ? "bg-violet-100 text-violet-800"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    {c.tipo}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{c.beneficiario}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatCurrency(Number(c.importe))}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {c.fecha_emision?.slice(0, 10)}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  <div className="flex flex-col items-start gap-1">
                    <span className="whitespace-nowrap">
                      {c.fecha_debito?.slice(0, 10)}
                    </span>
                    <DueBadge
                      date={c.fecha_debito}
                      isActive={c.estado === "EMITIDO"}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs ${ISSUED_BADGE[c.estado]}`}
                  >
                    {formatEstado(c.estado)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {c.estado === "EMITIDO" && (
                      <>
                        <Button
                          className="h-7 text-xs"
                          disabled={pendingId === c.id}
                          onClick={() => handleDebitar(c.id)}
                          size="sm"
                          variant="ghost"
                        >
                          Debitar
                        </Button>
                        <Button
                          className="h-7 text-xs"
                          disabled={pendingId === c.id}
                          onClick={() => handleRechazar(c.id)}
                          size="sm"
                          variant="ghost"
                        >
                          Rechazar
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgSlug: string;
};

type PortfolioView = "portfolio" | "deposit" | "new-check" | "new-issued-check";

export function CheckPortfolioManager({
  open,
  onOpenChange,
  orgId,
  orgSlug,
}: Props) {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<PortfolioView>("portfolio");
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["treasury"] });

  function handleRootOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setActiveView("portfolio");
    }
    onOpenChange(nextOpen);
  }

  function handleChildOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setActiveView("portfolio");
    }
  }

  function handleOpenDeposit() {
    setActiveView("deposit");
  }

  function handleOpenNewCheck() {
    setActiveView("new-check");
  }

  function handleOpenNewIssuedCheck() {
    setActiveView("new-issued-check");
  }

  return (
    <>
      <Dialog
        onOpenChange={handleRootOpenChange}
        open={open && activeView === "portfolio"}
      >
        <DialogContent className="flex h-[85dvh] w-[calc(100vw-2rem)] max-w-none flex-col gap-4 overflow-hidden sm:max-w-6xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>Cartera de cheques</DialogTitle>
          </DialogHeader>

          <Tabs
            className="flex min-h-0 flex-1 flex-col"
            defaultValue="recibidos"
          >
            <TabsList className="shrink-0">
              <TabsTrigger value="recibidos">Cheques recibidos</TabsTrigger>
              <TabsTrigger value="emitidos">Cheques emitidos</TabsTrigger>
            </TabsList>
            <TabsContent
              className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
              value="recibidos"
            >
              <ReceivedChecksTab
                onOpenDeposit={handleOpenDeposit}
                onOpenNewCheck={handleOpenNewCheck}
                onSuccess={invalidate}
                orgId={orgId}
                orgSlug={orgSlug}
              />
            </TabsContent>
            <TabsContent
              className="mt-2 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
              value="emitidos"
            >
              <IssuedChecksTab
                onOpenNewCheck={handleOpenNewIssuedCheck}
                orgId={orgId}
                orgSlug={orgSlug}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <CheckDepositSlipDialog
        onOpenChange={handleChildOpenChange}
        onSuccess={invalidate}
        open={open && activeView === "deposit"}
        orgId={orgId}
        orgSlug={orgSlug}
      />
      <ReceivedCheckFormDialog
        onOpenChange={handleChildOpenChange}
        onSuccess={invalidate}
        open={open && activeView === "new-check"}
        orgSlug={orgSlug}
      />
      <IssuedCheckFormDialog
        onOpenChange={handleChildOpenChange}
        onSuccess={invalidate}
        open={open && activeView === "new-issued-check"}
        orgId={orgId}
        orgSlug={orgSlug}
      />
    </>
  );
}
