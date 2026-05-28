"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
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
import { truncateMoney } from "@/lib/decimal";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createAdvanceReceiptAction } from "@/modules/sale-advances/actions/sale-advances.actions";
import { saleAdvancesQueryKey } from "@/modules/sale-advances/queries/query-keys";
import {
  RECEIPT_ITEM_LABELS,
  RETENTION_RECEIPT_ITEMS,
  type ReceiptItemType,
} from "@/modules/sale-advances/types";

const receiptItemSchema = z.object({
  item_type: z.enum([
    "transfer",
    "cash",
    "check_third",
    "retention_iibb",
    "retention_gcias",
  ] as const),
  amount: z.coerce.number().positive("El importe debe ser mayor a 0"),
  reference: z.string().optional(),
  bank_name: z.string().optional(),
  due_date: z.string().optional(),
});

const formSchema = z.object({
  items: z.array(receiptItemSchema).min(1, "Agregá al menos un método de pago"),
});

type FormValues = z.infer<typeof formSchema>;

type AdvanceReceiptDialogProps = {
  orgSlug: string;
  advanceId: string;
  advanceNumber: number;
  advanceTotal: number;
};

function getButtonText(isSubmitting: boolean): string {
  return isSubmitting ? "Guardando..." : "Confirmar cobro";
}

export function AdvanceReceiptDialog({
  orgSlug,
  advanceId,
  advanceNumber,
  advanceTotal,
}: AdvanceReceiptDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const defaultValues = useMemo(
    () => ({ items: [] as FormValues["items"] }),
    []
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const {
    handleSubmit,
    reset,
    control,
    watch,
    formState: { isSubmitting },
  } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const watchedItems = watch("items") ?? [];

  const totalCollected = truncateMoney(
    watchedItems
      .filter(
        (i) => !RETENTION_RECEIPT_ITEMS.includes(i.item_type as ReceiptItemType)
      )
      .reduce((sum, i) => sum + (i.amount ?? 0), 0)
  );
  const totalRetentions = truncateMoney(
    watchedItems
      .filter((i) =>
        RETENTION_RECEIPT_ITEMS.includes(i.item_type as ReceiptItemType)
      )
      .reduce((sum, i) => sum + (i.amount ?? 0), 0)
  );
  const netReceipt = truncateMoney(totalCollected - totalRetentions);
  const balance = truncateMoney(advanceTotal - netReceipt);
  const isBalanced = balance < 0.01;

  // Form for new item
  const [newType, setNewType] = useState<ReceiptItemType>("check_third");
  const [newAmount, setNewAmount] = useState("");
  const [newRef, setNewRef] = useState("");
  const [newBank, setNewBank] = useState("");
  const [newDue, setNewDue] = useState("");

  useEffect(() => {
    if (open) {
      reset(defaultValues);
      setErrorMessage(null);
    }
  }, [open, reset, defaultValues]);

  const handleClose = () => {
    setOpen(false);
    reset();
    setErrorMessage(null);
  };

  function addItem() {
    const amount = Number.parseFloat(newAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("El importe debe ser mayor a cero");
      return;
    }
    append({
      item_type: newType as FormValues["items"][number]["item_type"],
      amount,
      reference: newRef || undefined,
      bank_name: newBank || undefined,
      due_date: newDue || undefined,
    });
    setNewAmount("");
    setNewRef("");
    setNewBank("");
    setNewDue("");
  }

  const onSubmit = async (values: FormValues) => {
    if (!isBalanced) {
      setErrorMessage("El recibo debe cerrar en $0");
      return;
    }

    setErrorMessage(null);
    try {
      const result = await createAdvanceReceiptAction({
        orgSlug,
        advance_id: advanceId,
        items: values.items.map(
          ({ item_type, amount, reference, bank_name, due_date }) => ({
            item_type: item_type as ReceiptItemType,
            amount,
            reference: reference || undefined,
            bank_name: bank_name || undefined,
            due_date: due_date || undefined,
          })
        ),
      });

      if (result.success) {
        toast.success("Cobro registrado. El anticipo quedó cobrado.");
        handleClose();
        queryClient.invalidateQueries({
          queryKey: saleAdvancesQueryKey(orgSlug),
        });
      } else {
        setErrorMessage(result.error ?? "Error al registrar el cobro");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Error desconocido"
      );
    }
  };

  return (
    <Dialog
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          reset();
          setErrorMessage(null);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Registrar cobro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recibo de cobro — Anticipo #{advanceNumber}</DialogTitle>
          <DialogDescription>
            Agregá los métodos de cobro y retenciones sufridas. El recibo debe
            cerrar en {formatCurrency(advanceTotal)}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4 py-1">
              {fields.length > 0 && (
                <div className="space-y-2">
                  {fields.map((field, index) => {
                    const item = watchedItems[index];
                    const isRetention = RETENTION_RECEIPT_ITEMS.includes(
                      item?.item_type as ReceiptItemType
                    );
                    return (
                      <div
                        className="flex items-center gap-3 rounded-lg border px-3 py-2"
                        key={field.id}
                      >
                        <div className="min-w-0 flex-1">
                          <Badge
                            className="text-xs"
                            variant={isRetention ? "destructive" : "secondary"}
                          >
                            {
                              RECEIPT_ITEM_LABELS[
                                item?.item_type as ReceiptItemType
                              ]
                            }
                          </Badge>
                          {item?.reference && (
                            <p className="mt-0.5 font-mono text-muted-foreground text-xs">
                              {item.reference}
                              {item.bank_name ? ` · ${item.bank_name}` : ""}
                              {item.due_date ? ` · Vence ${item.due_date}` : ""}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            "font-semibold text-sm tabular-nums",
                            isRetention ? "text-destructive" : ""
                          )}
                        >
                          {isRetention ? "-" : ""}
                          {formatCurrency(item?.amount ?? 0)}
                        </span>
                        <Button
                          className="size-7 shrink-0"
                          onClick={() => remove(index)}
                          size="icon"
                          variant="ghost"
                        >
                          <TrashIcon className="size-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="space-y-3 rounded-lg border border-dashed p-3">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Agregar
                </p>
                <Select
                  onValueChange={(v) => setNewType(v as ReceiptItemType)}
                  value={newType}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(
                      Object.entries(RECEIPT_ITEM_LABELS) as [
                        ReceiptItemType,
                        string,
                      ][]
                    ).map(([type, label]) => (
                      <SelectItem key={type} value={type}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Importe</Label>
                    <Input
                      className="h-8"
                      onChange={(e) => setNewAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={newAmount}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Referencia</Label>
                    <Input
                      className="h-8"
                      onChange={(e) => setNewRef(e.target.value)}
                      placeholder="Nro cheque / CUIT..."
                      value={newRef}
                    />
                  </div>
                  {newType === "check_third" && (
                    <>
                      <div>
                        <Label className="text-xs">Banco</Label>
                        <Input
                          className="h-8"
                          onChange={(e) => setNewBank(e.target.value)}
                          placeholder="ICBC..."
                          value={newBank}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Vencimiento</Label>
                        <Input
                          className="h-8"
                          onChange={(e) => setNewDue(e.target.value)}
                          type="date"
                          value={newDue}
                        />
                      </div>
                    </>
                  )}
                </div>
                <Button
                  className="gap-1.5"
                  onClick={addItem}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <PlusIcon className="size-3.5" />
                  Agregar
                </Button>
              </div>

              <Separator />

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Total anticipo</span>
                  <span className="tabular-nums">
                    {formatCurrency(advanceTotal)}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Cobros</span>
                  <span className="text-green-600 tabular-nums">
                    {formatCurrency(totalCollected)}
                  </span>
                </div>
                {totalRetentions > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Retenciones sufridas</span>
                    <span className="text-red-600 tabular-nums">
                      -{formatCurrency(totalRetentions)}
                    </span>
                  </div>
                )}
              </div>

              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg p-3",
                  isBalanced
                    ? "border border-green-200 bg-green-50"
                    : "border border-amber-200 bg-amber-50"
                )}
              >
                {isBalanced ? (
                  <CheckCircleIcon
                    className="size-5 shrink-0 text-green-600"
                    weight="fill"
                  />
                ) : (
                  <WarningCircleIcon
                    className="size-5 shrink-0 text-amber-600"
                    weight="fill"
                  />
                )}
                <p
                  className={cn(
                    "font-semibold text-sm",
                    isBalanced ? "text-green-700" : "text-amber-700"
                  )}
                >
                  {isBalanced
                    ? "Recibo balanceado ✓"
                    : `Diferencia: ${formatCurrency(balance)}`}
                </p>
              </div>

              {errorMessage && (
                <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
                  {errorMessage}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                disabled={isSubmitting}
                onClick={handleClose}
                type="button"
                variant="outline"
              >
                Cancelar
              </Button>
              <Button
                disabled={!isBalanced || fields.length === 0 || isSubmitting}
                type="submit"
              >
                {getButtonText(isSubmitting)}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
