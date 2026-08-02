"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { IssuedCheckFormDialog } from "@/components/treasury/issued-check-form-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  RECHAZADO: "bg-red-100 text-red-800",
  ANULADO: "bg-gray-100 text-gray-800",
};

const ISSUED_BADGE: Record<IssuedCheckEstado, string> = {
  EMITIDO: "bg-yellow-100 text-yellow-800",
  DEBITADO: "bg-green-100 text-green-800",
  RECHAZADO: "bg-red-100 text-red-800",
  ANULADO: "bg-gray-100 text-gray-800",
};

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
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rechazarState, setRechazarState] = useState<{
    id: string;
    cuentaId: string;
  } | null>(null);
  const [, startTransition] = useTransition();

  function handleRechazar(id: string) {
    setRechazarState({ id, cuentaId: "" });
  }

  function confirmRechazar() {
    if (!rechazarState?.cuentaId) {
      return;
    }
    const { id, cuentaId } = rechazarState;
    setRechazarState(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await rechazarChequeRecibidoAction(orgSlug, id, cuentaId);
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
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
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

      <div className="rounded-md border">
        <Table>
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
            {cheques.length === 0 && (
              <TableRow>
                <TableCell
                  className="py-6 text-center text-muted-foreground text-sm"
                  colSpan={7}
                >
                  Sin cheques recibidos
                </TableCell>
              </TableRow>
            )}
            {cheques.map((c) => (
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
                <TableCell className="text-sm">
                  {c.fecha_vencimiento?.slice(0, 10)}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${RECEIVED_BADGE[c.estado]}`}
                  >
                    {c.estado}
                  </span>
                </TableCell>
                <TableCell>
                  {c.estado === "DEPOSITADO" && (
                    <Button
                      className="h-7 text-xs"
                      disabled={pendingId === c.id}
                      onClick={() => handleRechazar(c.id)}
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
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="rechazar-cuenta">ID de cuenta bancaria</Label>
            <Input
              id="rechazar-cuenta"
              onChange={(e) =>
                setRechazarState((s) =>
                  s ? { ...s, cuentaId: e.target.value } : null
                )
              }
              placeholder="UUID de la cuenta bancaria"
              value={rechazarState?.cuentaId ?? ""}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setRechazarState(null)} variant="outline">
              Cancelar
            </Button>
            <Button
              disabled={!rechazarState?.cuentaId}
              onClick={confirmRechazar}
            >
              Confirmar
            </Button>
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
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button className="gap-1.5" onClick={onOpenNewCheck} size="sm">
          <PlusIcon className="h-4 w-4" />
          Cargar cheque
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
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
            {cheques.length === 0 && (
              <TableRow>
                <TableCell
                  className="py-6 text-center text-muted-foreground text-sm"
                  colSpan={7}
                >
                  Sin cheques emitidos
                </TableCell>
              </TableRow>
            )}
            {cheques.map((c) => (
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
                  {c.fecha_debito?.slice(0, 10)}
                </TableCell>
                <TableCell>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${ISSUED_BADGE[c.estado]}`}
                  >
                    {c.estado}
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
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Cartera de cheques</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="recibidos">
            <TabsList>
              <TabsTrigger value="recibidos">Cheques recibidos</TabsTrigger>
              <TabsTrigger value="emitidos">Cheques emitidos</TabsTrigger>
            </TabsList>
            <TabsContent className="mt-4" value="recibidos">
              <ReceivedChecksTab
                onOpenDeposit={handleOpenDeposit}
                onOpenNewCheck={handleOpenNewCheck}
                onSuccess={invalidate}
                orgId={orgId}
                orgSlug={orgSlug}
              />
            </TabsContent>
            <TabsContent className="mt-4" value="emitidos">
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
