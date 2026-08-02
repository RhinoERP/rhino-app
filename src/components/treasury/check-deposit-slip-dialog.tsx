"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { formatCurrency } from "@/lib/format";
import { createBoletaDepositoChequesAction } from "@/modules/treasury/actions/deposit-slips.action";
import { useTreasuryOperationId } from "@/modules/treasury/hooks/use-treasury-operation-id";
import {
  useChequesRecibidos,
  useCuentasBancarias,
} from "@/modules/treasury/queries/queries.client";

const formSchema = z.object({
  cuentaBancariaId: z.string().uuid("Selecciona una cuenta bancaria destino"),
  fecha: z.string().min(1, "Requerido"),
  descripcion: z.string().min(1, "Requerido").max(500),
});

type FormValues = z.infer<typeof formSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgSlug: string;
  orgId: string;
  onSuccess?: () => void;
};

export function CheckDepositSlipDialog({
  open,
  onOpenChange,
  orgSlug,
  orgId,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { getOperationId, resetOperationId } = useTreasuryOperationId();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cuentaBancariaId: "",
      fecha: new Date().toISOString().split("T")[0],
      descripcion: "Boleta de depósito de cheques",
    },
  });
  const { reset } = form;

  const { data: cuentas = [] } = useCuentasBancarias(orgId, {
    soloActivas: true,
    enabled: open,
  });
  const { data: cheques = [], isLoading: loadingCheques } = useChequesRecibidos(
    orgId,
    "EN_CARTERA",
    { enabled: open }
  );

  useEffect(() => {
    if (!open) {
      reset();
      setSelectedIds(new Set());
      resetOperationId();
    }
  }, [open, reset, resetOperationId]);

  useEffect(() => {
    const subscription = form.watch((_value, { type }) => {
      if (type === "change") {
        resetOperationId();
      }
    });

    return () => subscription.unsubscribe();
  }, [form, resetOperationId]);

  function toggleCheck(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function setCheckSelected(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  const totalSeleccionado = cheques
    .filter((c) => selectedIds.has(c.id))
    .reduce((sum, c) => sum + Number(c.importe), 0);

  function onSubmit(values: FormValues) {
    if (selectedIds.size === 0) {
      toast.error("Seleccioná al menos un cheque para depositar");
      return;
    }

    startTransition(async () => {
      const result = await createBoletaDepositoChequesAction(orgSlug, {
        operationId: getOperationId(),
        cuentaBancariaId: values.cuentaBancariaId,
        fecha: values.fecha,
        descripcion: values.descripcion,
        checkIds: Array.from(selectedIds),
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Boleta de depósito registrada");
      resetOperationId();
      onSuccess?.();
      onOpenChange(false);
    });
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Boleta de Depósito de Cheques</DialogTitle>
          <DialogDescription>
            Seleccioná los cheques en cartera a depositar y la cuenta bancaria
            destino.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="cuentaBancariaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cuenta bancaria destino</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar cuenta" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {cuentas.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nombre} — {c.banco}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fecha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de depósito</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="descripcion"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <p className="font-medium text-sm">
                Cheques en cartera ({cheques.length})
              </p>
              {loadingCheques && (
                <p className="py-4 text-center text-muted-foreground text-sm">
                  Cargando cheques...
                </p>
              )}
              {!loadingCheques && cheques.length === 0 && (
                <p className="rounded-md border py-4 text-center text-muted-foreground text-sm">
                  No hay cheques en cartera disponibles para depositar.
                </p>
              )}
              {!loadingCheques && cheques.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>N° Cheque</TableHead>
                        <TableHead>Banco emisor</TableHead>
                        <TableHead>Librador</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                        <TableHead>Vencimiento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cheques.map((c) => (
                        <TableRow
                          className="cursor-pointer"
                          key={c.id}
                          onClick={() => toggleCheck(c.id)}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(c.id)}
                              onCheckedChange={(checked) =>
                                setCheckSelected(c.id, checked === true)
                              }
                              onClick={(event) => event.stopPropagation()}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {c.numero_cheque}
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.banco_emisor}
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.librador ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatCurrency(Number(c.importe))}
                          </TableCell>
                          <TableCell className="text-sm tabular-nums">
                            {c.fecha_vencimiento?.slice(0, 10)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                  <span>
                    {selectedIds.size} cheque{selectedIds.size !== 1 ? "s" : ""}{" "}
                    seleccionado
                    {selectedIds.size !== 1 ? "s" : ""}
                  </span>
                  <span className="font-semibold tabular-nums">
                    Total: {formatCurrency(totalSeleccionado)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                onClick={() => onOpenChange(false)}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={isPending || selectedIds.size === 0}
                type="submit"
              >
                {isPending ? "Depositando..." : "Confirmar depósito"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
