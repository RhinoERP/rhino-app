"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { correctMeliReceiverAction } from "@/modules/mercadolibre/actions/meli-receiver.action";
import {
  type MeliReceiver,
  meliReceiverSchema,
} from "@/modules/mercadolibre/types";

const schema = z.object({
  receiver: meliReceiverSchema,
  reason: z.string().trim().min(5).max(500),
});
type Values = z.input<typeof schema>;

export function MeliReceiverCorrection({
  orgSlug,
  saleId,
  updatedAt,
  receiver,
}: {
  orgSlug: string;
  saleId: string;
  updatedAt: string;
  receiver: MeliReceiver;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { receiver, reason: "" },
  });
  return (
    <div className="space-y-3">
      <Button
        onClick={() => {
          form.reset({ receiver, reason: "" });
          setOpen(!open);
        }}
        type="button"
        variant="outline"
      >
        {open ? "Cerrar corrección" : "Corregir datos del receptor"}
      </Button>
      {open && (
        <form
          className="space-y-3 rounded-md border p-4"
          onSubmit={form.handleSubmit((values) =>
            startTransition(async () => {
              try {
                const result = await correctMeliReceiverAction(orgSlug, {
                  ...values,
                  saleId,
                  expectedUpdatedAt: updatedAt,
                });
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success(
                  "Receptor corregido. Ya podés emitir o reintentar la factura."
                );
                setOpen(false);
                router.refresh();
              } catch {
                toast.error(
                  "No se pudo obtener la respuesta. Actualizá el detalle antes de volver a guardar."
                );
              }
            })
          )}
        >
          <p className="text-muted-foreground text-sm">
            Se conserva la condición fiscal y el comprobante. La corrección
            queda auditada en la venta y no modifica el cliente registrado.
          </p>
          <div className="space-y-2">
            <Label htmlFor="receiver-document">{receiver.document_type}</Label>
            <Input
              id="receiver-document"
              {...form.register("receiver.document_number")}
              required
            />
          </div>
          {receiver.tax_condition === "CONSUMIDOR_FINAL" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="receiver-first">Nombre</Label>
                <Input
                  id="receiver-first"
                  {...form.register("receiver.first_name")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="receiver-last">Apellido</Label>
                <Input
                  id="receiver-last"
                  {...form.register("receiver.last_name")}
                  required
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="receiver-business">Razón social</Label>
              <Input
                id="receiver-business"
                {...form.register("receiver.business_name")}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="receiver-address">Dirección</Label>
            <Input
              id="receiver-address"
              {...form.register("receiver.address")}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="receiver-reason">Motivo de corrección</Label>
            <Input
              id="receiver-reason"
              {...form.register("reason")}
              maxLength={500}
              minLength={5}
              required
            />
          </div>
          {Object.keys(form.formState.errors).length > 0 && (
            <p className="text-destructive text-sm" role="alert">
              Revisá el documento, los datos obligatorios y el motivo de la
              corrección.
            </p>
          )}
          <Button disabled={pending} type="submit">
            {pending ? "Guardando…" : "Guardar corrección"}
          </Button>
        </form>
      )}
    </div>
  );
}
