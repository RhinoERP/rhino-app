"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { debitarChequeEmitidoAction } from "@/modules/treasury/actions/checks.action";
import { useChequesEmitidos } from "@/modules/treasury/queries/queries.client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  orgId: string;
  onSuccess?: () => void;
};

export function OwnCheckDebitDialog({
  open,
  onOpenChange,
  orgSlug,
  orgId,
  onSuccess,
}: Props) {
  const {
    data: cheques = [],
    isLoading,
    refetch,
  } = useChequesEmitidos(orgId, "EMITIDO", {
    enabled: open,
  });
  const [pendingId, setPendingId] = useTransition();
  const [, startTransition] = [pendingId, setPendingId];

  function handleDebitar(id: string) {
    startTransition(async () => {
      const result = await debitarChequeEmitidoAction(orgSlug, id);
      if (result.success) {
        toast.success("Cheque marcado como debitado");
        refetch();
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Débito de Cheques Propios</DialogTitle>
          <DialogDescription>
            Marcá los cheques propios que ya fueron debitados por el banco. Al
            confirmar se crea el asiento contable y se actualiza el saldo
            operativo.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <p className="py-6 text-center text-muted-foreground text-sm">
            Cargando...
          </p>
        )}
        {!isLoading && cheques.length === 0 && (
          <p className="py-6 text-center text-muted-foreground text-sm">
            No hay cheques propios emitidos pendientes de débito.
          </p>
        )}
        {!isLoading && cheques.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N° Cheque</TableHead>
                  <TableHead>Beneficiario</TableHead>
                  <TableHead className="text-right">Importe</TableHead>
                  <TableHead>Fecha débito</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cheques.map((cheque) => (
                  <TableRow key={cheque.id}>
                    <TableCell className="font-mono text-sm">
                      {cheque.numero_cheque}
                    </TableCell>
                    <TableCell>{cheque.beneficiario}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(Number(cheque.importe))}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {cheque.fecha_debito?.slice(0, 10)}
                    </TableCell>
                    <TableCell>
                      <Button
                        onClick={() => handleDebitar(cheque.id)}
                        size="sm"
                        variant="outline"
                      >
                        Marcar debitado
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={() => onOpenChange(false)} variant="outline">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
