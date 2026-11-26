"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import {
  createMeliPaymentAction,
  voidMeliPaymentAction,
} from "@/modules/mercadolibre/actions/meli-payments.action";
import type { MeliPaymentSale } from "@/modules/mercadolibre/service/meli-payments.service";
import {
  type CreateMeliPaymentInput,
  createMeliPaymentSchema,
  voidMeliPaymentSchema,
} from "@/modules/mercadolibre/utils/payment-contract";

type Payment = z.output<typeof createMeliPaymentSchema>;
type VoidInput = z.output<typeof voidMeliPaymentSchema>;

export function MeliPaymentForm({
  orgSlug,
  sale,
}: {
  orgSlug: string;
  sale: MeliPaymentSale;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const attempt = useRef<Payment | null>(null);
  const form = useForm<CreateMeliPaymentInput, unknown, Payment>({
    resolver: zodResolver(createMeliPaymentSchema),
    defaultValues: {
      saleId: sale.saleId,
      idempotencyKey: "",
      amount: sale.outstandingAmount,
      currency: sale.currency,
      paymentDate: format(new Date(), "yyyy-MM-dd"),
      referenceNumber: "",
      notes: "",
    },
  });
  const label = locked ? "Conciliar el mismo cobro" : "Registrar cobro bruto";
  function submit(values: Payment) {
    if (running.current) {
      return;
    }
    running.current = true;
    attempt.current ??= structuredClone(values);
    setLocked(true);
    setError("");
    startTransition(async () => {
      try {
        const result = await createMeliPaymentAction(orgSlug, attempt.current);
        if (!result.success) {
          setError(result.error);
          if (result.canEdit) {
            attempt.current = null;
            setLocked(false);
            router.refresh();
          }
          return;
        }
        attempt.current = null;
        setLocked(false);
        form.reset({
          saleId: sale.saleId,
          idempotencyKey: "",
          amount: 0,
          currency: sale.currency,
          paymentDate: format(new Date(), "yyyy-MM-dd"),
          referenceNumber: "",
          notes: "",
        });
        const message =
          result.data.payment_status === "VOIDED"
            ? "Registro recuperado: esa carga ya estaba anulada."
            : "Cobro bruto registrado en Mercado Pago.";
        toast.success(message);
        router.refresh();
      } catch {
        setError(
          "No se obtuvo la respuesta. Se conservan los datos y la clave; conciliá el mismo intento."
        );
      } finally {
        running.current = false;
      }
    });
  }
  return (
    <section className="space-y-3 rounded-md border p-4">
      <h2 className="font-semibold text-lg">Registrar cobro</h2>
      <p className="text-muted-foreground text-sm">
        Cargá el importe bruto verificado en Mercado Pago, en la moneda de esta
        venta. Importe sin cobro registrado:{" "}
        {formatCurrency(sale.outstandingAmount, sale.currency)}.
      </p>
      <p className="text-muted-foreground text-sm">
        Registrar el cobro no genera asientos automáticamente. Para
        contabilizarlo, completá el desglose y confirmá los asientos desde el
        historial contable.
      </p>
      <form
        className="space-y-3"
        noValidate
        onSubmit={(event) => {
          if (attempt.current) {
            event.preventDefault();
            submit(attempt.current);
            return;
          }
          if (!form.getValues("idempotencyKey")) {
            form.setValue("idempotencyKey", crypto.randomUUID());
          }
          form.handleSubmit(submit)(event);
        }}
      >
        <fieldset
          className="grid gap-3 sm:grid-cols-2"
          disabled={pending || locked}
        >
          <div className="space-y-2">
            <Label htmlFor="meli-gross-payment">
              Importe bruto ({sale.currency})
            </Label>
            <Input
              id="meli-gross-payment"
              min="0.01"
              step="0.01"
              type="number"
              {...form.register("amount", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meli-payment-date">Fecha del cobro</Label>
            <Input
              id="meli-payment-date"
              type="date"
              {...form.register("paymentDate")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meli-payment-reference">
              ID de operación Mercado Pago
            </Label>
            <Input
              id="meli-payment-reference"
              maxLength={120}
              {...form.register("referenceNumber")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="meli-payment-notes">Notas</Label>
            <Input
              id="meli-payment-notes"
              maxLength={2000}
              {...form.register("notes")}
            />
          </div>
        </fieldset>
        {Object.keys(form.formState.errors).length > 0 && (
          <p className="text-destructive text-sm" role="alert">
            Revisá importe, fecha e ID de operación. El importe admite hasta dos
            decimales.
          </p>
        )}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        {locked && (
          <p className="text-muted-foreground text-sm">
            El intento conserva su clave e importe hasta obtener una
            confirmación. No se creará otro registro al reintentarlo.
          </p>
        )}
        <Button disabled={pending} type="submit">
          {pending ? "Registrando…" : label}
        </Button>
      </form>
    </section>
  );
}

export function VoidMeliPaymentForm({
  orgSlug,
  paymentId,
}: {
  orgSlug: string;
  paymentId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const attempt = useRef<VoidInput | null>(null);
  const form = useForm<VoidInput>({
    resolver: zodResolver(voidMeliPaymentSchema),
    defaultValues: { paymentId, reason: "" },
  });
  function submit(values: VoidInput) {
    if (running.current) {
      return;
    }
    running.current = true;
    attempt.current ??= structuredClone(values);
    setLocked(true);
    setError("");
    startTransition(async () => {
      try {
        const result = await voidMeliPaymentAction(orgSlug, attempt.current);
        if (!result.success) {
          setError(result.error);
          if (result.canEdit) {
            attempt.current = null;
            setLocked(false);
            router.refresh();
          }
          return;
        }
        toast.success(
          result.data.idempotent
            ? "La carga ya estaba anulada."
            : "Carga anulada, con su historial conservado."
        );
        attempt.current = null;
        setLocked(false);
        setOpen(false);
        form.reset({ paymentId, reason: "" });
        router.refresh();
      } catch {
        setError(
          "No se obtuvo respuesta. Consultá el historial y reintentá la misma anulación."
        );
      } finally {
        running.current = false;
      }
    });
  }
  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="outline"
      >
        Anular carga errónea
      </Button>
    );
  }
  return (
    <form
      className="space-y-2 rounded-md border p-3"
      noValidate
      onSubmit={(event) => {
        if (attempt.current) {
          event.preventDefault();
          submit(attempt.current);
          return;
        }
        form.handleSubmit(submit)(event);
      }}
    >
      <p className="text-muted-foreground text-sm">
        Corrige un registro cargado por error. Esta operación no es un reembolso
        ni devuelve dinero.
      </p>
      <Label htmlFor={`void-payment-${paymentId}`}>Motivo de anulación</Label>
      <Input
        disabled={pending || locked}
        id={`void-payment-${paymentId}`}
        maxLength={500}
        {...form.register("reason")}
      />
      {form.formState.errors.reason && (
        <p className="text-destructive text-sm">
          Indicá un motivo de al menos cinco caracteres.
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} size="sm" type="submit">
          {pending ? "Procesando…" : "Confirmar anulación de carga"}
        </Button>
        <Button
          disabled={pending || locked}
          onClick={() => setOpen(false)}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cerrar
        </Button>
      </div>
    </form>
  );
}
