"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { MeliFiscalAccountingHistory } from "@/components/mercadolibre/meli-fiscal-accounting-history";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDateOnly } from "@/lib/format";
import { generatePDFFromHTML } from "@/lib/pdf-generator";
import {
  cancelMeliCreditNoteAction,
  createMeliCreditNoteAction,
  downloadMeliCreditNoteAction,
  emitMeliCreditNoteAction,
  reconcileMeliCreditNoteAction,
} from "@/modules/mercadolibre/actions/meli-credit-note.action";
import type { listMeliCreditNotes } from "@/modules/mercadolibre/service/meli-credit-note-read.service";
import { createMeliCreditNoteSchema } from "@/modules/mercadolibre/types";
import { getMeliFiscalStatusLabel } from "@/modules/mercadolibre/utils/fiscal-status";

const formSchema = createMeliCreditNoteSchema.omit({
  saleId: true,
  idempotencyKey: true,
});
type Values = z.infer<typeof formSchema>;

export function MeliCreditNotes({
  orgSlug,
  saleId,
  currency,
  notes,
  remaining,
  canCreate,
  canIssue,
  canReviewAccounting,
}: {
  orgSlug: string;
  saleId: string;
  currency: string;
  notes: Awaited<ReturnType<typeof listMeliCreditNotes>>["notes"];
  remaining: number;
  canCreate: boolean;
  canIssue: boolean;
  canReviewAccounting: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locked, setLocked] = useState(false);
  const running = useRef(false);
  const submitLabel = locked
    ? "Conciliar el mismo intento"
    : "Registrar nota de crédito";
  const attempt = useRef<{ key: string; values: Values } | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: remaining,
      issueDate: format(new Date(), "yyyy-MM-dd"),
      reason: "",
    },
  });
  const operation = (run: () => Promise<void>) => {
    if (running.current) {
      return;
    }
    running.current = true;
    startTransition(async () => {
      try {
        await run();
      } catch {
        toast.error(
          "No se pudo obtener la respuesta. Actualizá el detalle antes de reintentar."
        );
      } finally {
        running.current = false;
        router.refresh();
      }
    });
  };
  return (
    <section className="space-y-4 rounded-md border p-4">
      <h2 className="font-semibold text-lg">Notas de crédito Mercado Libre</h2>
      <p className="text-muted-foreground text-sm">
        Saldo disponible para nuevas NC: {formatCurrency(remaining, currency)}.
        Las notas confirmadas reservan su importe aunque su emisión fiscal esté
        pendiente.
      </p>
      {notes.map((note) => (
        <div className="space-y-2 border-t pt-3" key={note.id}>
          <p className="font-medium">
            {note.credit_note_number} · {formatCurrency(note.amount, currency)}{" "}
            · {formatDateOnly(note.issue_date)}
          </p>
          <p className="text-sm">{note.reason}</p>
          <p className="text-muted-foreground text-sm">
            {note.status === "CANCELLED"
              ? "Cancelada"
              : getMeliFiscalStatusLabel(note.arca_status)}
          </p>
          {note.arca_last_error && (
            <p className="text-destructive text-sm">{note.arca_last_error}</p>
          )}
          {canReviewAccounting && (
            <MeliFiscalAccountingHistory
              orgSlug={orgSlug}
              origin={{ type: "creditNote", saleId, creditNoteId: note.id }}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {canIssue && note.arca_status === "pending" && (
              <Button
                disabled={pending}
                onClick={() =>
                  operation(async () => {
                    const result = await reconcileMeliCreditNoteAction(
                      orgSlug,
                      note.id
                    );
                    if (!result.success) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success(
                      "Autorización de la nota de crédito recuperada."
                    );
                  })
                }
                type="button"
                variant="outline"
              >
                Consultar autorización pendiente
              </Button>
            )}
            {canIssue &&
              note.status === "CONFIRMED" &&
              ["not_requested", "error"].includes(note.arca_status) && (
                <Button
                  disabled={pending}
                  onClick={() =>
                    operation(async () => {
                      const result = await emitMeliCreditNoteAction(
                        orgSlug,
                        note.id
                      );
                      if (!result.success) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Nota de crédito autorizada.");
                    })
                  }
                  type="button"
                  variant="outline"
                >
                  Emitir / reintentar NC
                </Button>
              )}
            {note.arca_status === "authorized" && (
              <Button
                disabled={pending}
                onClick={() =>
                  operation(async () => {
                    const result = await downloadMeliCreditNoteAction(
                      orgSlug,
                      note.id
                    );
                    if (!result.success) {
                      toast.error(result.error);
                      return;
                    }
                    await generatePDFFromHTML(
                      result.data.html,
                      result.data.filename
                    );
                  })
                }
                type="button"
                variant="outline"
              >
                Descargar NC PDF
              </Button>
            )}
            {canCreate &&
              note.status === "CONFIRMED" &&
              ["not_requested", "error"].includes(note.arca_status) && (
                <Button
                  disabled={pending}
                  onClick={() =>
                    operation(async () => {
                      const result = await cancelMeliCreditNoteAction(
                        orgSlug,
                        note.id
                      );
                      if (!result.success) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success(
                        "Nota sin emitir cancelada; su importe vuelve a estar disponible."
                      );
                    })
                  }
                  type="button"
                  variant="outline"
                >
                  Cancelar NC sin emitir
                </Button>
              )}
          </div>
        </div>
      ))}
      {canCreate && (remaining > 0 || locked) && (
        <form
          className="space-y-3 border-t pt-4"
          onSubmit={form.handleSubmit((values) =>
            operation(async () => {
              attempt.current ??= { key: crypto.randomUUID(), values };
              setLocked(true);
              const result = await createMeliCreditNoteAction(orgSlug, {
                ...attempt.current.values,
                saleId,
                idempotencyKey: attempt.current.key,
              });
              if (!result.success) {
                toast.error(result.error);
                if (result.canEdit) {
                  attempt.current = null;
                  setLocked(false);
                }
                return;
              }
              toast.success(
                result.data.idempotent
                  ? "Nota de crédito recuperada sin duplicar."
                  : "Nota de crédito registrada. Ya podés emitirla."
              );
              attempt.current = null;
              setLocked(false);
              form.reset({ ...values, reason: "" });
            })
          )}
        >
          <p className="text-sm">
            Ajuste de importe sobre la factura. No genera saldo en Cobranzas ni
            repone stock automáticamente; el reingreso requiere una devolución
            física registrada en Inventario.
          </p>
          <fieldset
            className="grid gap-3 sm:grid-cols-2"
            disabled={pending || locked}
          >
            <div className="space-y-2">
              <Label htmlFor="nc-amount">Importe ({currency})</Label>
              <Input
                id="nc-amount"
                min="0.01"
                step="0.01"
                type="number"
                {...form.register("amount", { valueAsNumber: true })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nc-date">Fecha</Label>
              <Input
                id="nc-date"
                type="date"
                {...form.register("issueDate")}
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nc-reason">Motivo</Label>
              <Input
                id="nc-reason"
                maxLength={500}
                minLength={5}
                {...form.register("reason")}
                required
              />
            </div>
          </fieldset>
          {Object.keys(form.formState.errors).length > 0 && (
            <p className="text-destructive text-sm" role="alert">
              Revisá importe, fecha y motivo de la nota de crédito.
            </p>
          )}
          {locked && (
            <p className="text-muted-foreground text-sm">
              El intento conserva sus datos para conciliar una respuesta perdida
              sin duplicar la nota.
            </p>
          )}
          <Button disabled={pending} type="submit">
            {pending ? "Procesando…" : submitLabel}
          </Button>
        </form>
      )}
    </section>
  );
}
