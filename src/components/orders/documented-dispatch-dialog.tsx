"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { CAI_ERROR, CAI_PRIMARY_ACTION } from "@/components/arca/cai-ui-styles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Spinner } from "@/components/ui/spinner";
import { formatCurrency } from "@/lib/format";
import { confirmOrderRemittancesAction } from "@/modules/orders/actions/confirm-order-remittances.action";
import {
  type PreparedOrderRemittances,
  prepareOrderRemittancesAction,
} from "@/modules/orders/actions/prepare-order-remittances.action";

const integerPattern = /^\d+$/;
const transportCuitPattern = /^\d{11}$/;
const amountPattern = /^\d+(?:[.,]\d{1,2})?$/;
const fieldsSchema = z.object({
  transportThirdParty: z.boolean(),
  transportName: z.string().trim(),
  transportCuit: z.string().trim(),
  transportAddress: z.string().trim(),
  documents: z
    .array(
      z.object({
        number: z.string().trim(),
        packageCount: z
          .string()
          .refine(
            (value) => value === "" || integerPattern.test(value),
            "Ingresá un entero no negativo."
          ),
        declaredValue: z
          .string()
          .refine(
            (value) => value === "" || amountPattern.test(value),
            "Ingresá un importe con hasta dos decimales."
          ),
      })
    )
    .min(1),
});
type Fields = z.infer<typeof fieldsSchema>;

function fiscalTransport(values: Fields, fiscal: boolean) {
  if (!(fiscal && values.transportThirdParty)) {
    return { data: undefined };
  }
  if (
    !(
      values.transportName &&
      values.transportAddress &&
      transportCuitPattern.test(values.transportCuit)
    )
  ) {
    return {
      error: "Completá nombre, CUIT sin guiones y domicilio del transportista.",
    };
  }
  return {
    data: {
      name: values.transportName,
      cuit: values.transportCuit,
      address: values.transportAddress,
    },
  };
}

export function DocumentedDispatchDialog({
  orgSlug,
  childOrderIds,
  onSuccess,
}: {
  orgSlug: string;
  childOrderIds: string[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const transportId = useId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [plan, setPlan] = useState<PreparedOrderRemittances | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) {
      errorRef.current?.focus();
    }
  }, [error]);
  const requestKey = useRef("");
  const pendingRef = useRef(false);
  const form = useForm<Fields>({
    resolver: zodResolver(fieldsSchema),
    defaultValues: {
      documents: [],
      transportThirdParty: false,
      transportName: "",
      transportCuit: "",
      transportAddress: "",
    },
  });
  const { fields } = useFieldArray({
    control: form.control,
    name: "documents",
  });

  const prepare = async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setPlan(null);
    setAttempted(false);
    requestKey.current = crypto.randomUUID();
    try {
      const result = await prepareOrderRemittancesAction({
        orgSlug,
        childOrderIds,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setPlan(result.data);
      form.reset({
        transportThirdParty: !!result.data.carrierName,
        transportName: result.data.carrierName ?? "",
        transportCuit: "",
        transportAddress: "",
        documents: result.data.documents.map((document) => ({
          number: "",
          packageCount: "",
          declaredValue:
            document.suggestedDeclaredValue > 0
              ? document.suggestedDeclaredValue.toFixed(2)
              : "",
        })),
      });
    } catch {
      setError("No se pudo preparar el despacho. Revisá la conexión.");
    } finally {
      setLoading(false);
    }
  };
  const submit = form.handleSubmit(async (values) => {
    if (!plan || pendingRef.current) {
      return;
    }
    if (
      !plan.automaticNumbering &&
      values.documents.some((document) => !document.number)
    ) {
      setError("Completá el número de cada remito.");
      return;
    }
    const transport = fiscalTransport(values, !!plan.fiscalAuthorization);
    if (transport.error) {
      setError(transport.error);
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setAttempted(true);
    setError(null);
    try {
      const result = await confirmOrderRemittancesAction({
        orgSlug,
        childOrderIds: plan.childOrderIds,
        sourceFingerprint: plan.sourceFingerprint,
        idempotencyKey: requestKey.current,
        automaticNumbering: plan.automaticNumbering,
        transport: transport.data,
        documents: values.documents.map((document) => ({
          number: document.number,
          packageCount:
            document.packageCount === "" ? null : Number(document.packageCount),
          declaredValue:
            document.declaredValue === ""
              ? null
              : Number(document.declaredValue.replace(",", ".")),
        })),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(
        `Despacho confirmado — Remitos ${result.documents.map((document) => document.document_number).join(", ")}`
      );
      setOpen(false);
      setPlan(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["order-dispatch-events", orgSlug],
        }),
        queryClient.invalidateQueries({
          queryKey: ["order-remittance-documents", orgSlug],
        }),
      ]);
      onSuccess?.();
      router.refresh();
    } catch {
      setError(
        "No se pudo obtener la respuesta. Reintentá la misma confirmación para comprobar el resultado sin duplicar remitos."
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  });

  const confirmationLabel = attempted
    ? "Reintentar confirmación"
    : "Confirmar despacho";
  return (
    <>
      <Button
        className={CAI_PRIMARY_ACTION}
        disabled={loading || pending || !childOrderIds.length}
        onClick={prepare}
        size="sm"
        type="button"
      >
        Preparar remitos y despachar
      </Button>
      <Dialog
        onOpenChange={(value) => {
          if (!(pending || loading)) {
            setOpen(value);
          }
        }}
        open={open}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Confirmar despacho</DialogTitle>
            <DialogDescription>
              Se genera un remito independiente por cada bloque de hasta 26
              líneas. Completá los datos de cada documento.
            </DialogDescription>
          </DialogHeader>
          {loading && (
            <div className="flex items-center gap-2">
              <Spinner />
              Preparando documentos…
            </div>
          )}
          {error && (
            <p className={CAI_ERROR} ref={errorRef} role="alert" tabIndex={-1}>
              {error}
            </p>
          )}
          {!(loading || plan) && (
            <DialogFooter>
              <Button
                onClick={() => setOpen(false)}
                type="button"
                variant="outline"
              >
                Cerrar
              </Button>
              <Button onClick={prepare} type="button" variant="outline">
                Reintentar preparación
              </Button>
            </DialogFooter>
          )}
          {plan && (
            <form className="space-y-4" onSubmit={submit}>
              <p className="text-sm">
                {plan.documents.length} remito(s).{" "}
                {plan.automaticNumbering
                  ? "Los números definitivos se asignan al confirmar."
                  : "Indicá el número preimpreso de cada hoja."}
              </p>
              {plan.fiscalAuthorization && (
                <div className="rounded-md border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">
                    Remitos R con CAI {plan.fiscalAuthorization.cai}
                  </p>
                  <p className="text-muted-foreground">
                    Punto de venta {plan.fiscalAuthorization.pointOfSale} ·
                    Vencimiento{" "}
                    {plan.fiscalAuthorization.expiresAt
                      .split("-")
                      .reverse()
                      .join("/")}
                    . Los números se asignan al confirmar y se conservan al
                    reimprimir.
                  </p>
                </div>
              )}
              {plan.fiscalAuthorization && (
                <fieldset
                  className="space-y-3 rounded-md border p-3"
                  disabled={pending || attempted}
                >
                  <div className="flex items-center gap-2">
                    <Controller
                      control={form.control}
                      name="transportThirdParty"
                      render={({ field }) => (
                        <Checkbox
                          checked={field.value}
                          id={`${transportId}-third-party`}
                          onCheckedChange={(checked) =>
                            field.onChange(checked === true)
                          }
                        />
                      )}
                    />
                    <Label htmlFor={`${transportId}-third-party`}>
                      Interviene un transporte de terceros
                    </Label>
                  </div>
                  {form.watch("transportThirdParty") && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor={`${transportId}-name`}>
                          Transportista
                        </Label>
                        <Input
                          id={`${transportId}-name`}
                          maxLength={200}
                          {...form.register("transportName")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${transportId}-cuit`}>
                          CUIT sin guiones
                        </Label>
                        <Input
                          id={`${transportId}-cuit`}
                          inputMode="numeric"
                          maxLength={11}
                          {...form.register("transportCuit")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`${transportId}-address`}>
                          Domicilio
                        </Label>
                        <Input
                          id={`${transportId}-address`}
                          maxLength={300}
                          {...form.register("transportAddress")}
                        />
                      </div>
                    </div>
                  )}
                </fieldset>
              )}
              {fields.map((field, index) => (
                <section
                  className="space-y-3 rounded-md border p-3"
                  key={field.id}
                >
                  <h3 className="font-medium">
                    Remito {index + 1} — {plan.documents[index].lines.length}{" "}
                    líneas
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label htmlFor={`${field.id}-number`}>Número</Label>
                      <Input
                        id={`${field.id}-number`}
                        placeholder={
                          plan.automaticNumbering
                            ? "Automático"
                            : "Número preimpreso"
                        }
                        readOnly={attempted || plan.automaticNumbering}
                        {...form.register(`documents.${index}.number`)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${field.id}-packages`}>Bultos</Label>
                      <Input
                        aria-describedby={`${field.id}-packages-error`}
                        aria-invalid={
                          !!form.formState.errors.documents?.[index]
                            ?.packageCount
                        }
                        id={`${field.id}-packages`}
                        inputMode="numeric"
                        placeholder="Sin especificar"
                        readOnly={attempted}
                        {...form.register(`documents.${index}.packageCount`)}
                      />
                      <p
                        className={CAI_ERROR}
                        id={`${field.id}-packages-error`}
                      >
                        {
                          form.formState.errors.documents?.[index]?.packageCount
                            ?.message
                        }
                      </p>
                    </div>
                    <div>
                      <Label htmlFor={`${field.id}-declared`}>
                        Valor declarado
                      </Label>
                      <Input
                        aria-describedby={`${field.id}-declared-error`}
                        aria-invalid={
                          !!form.formState.errors.documents?.[index]
                            ?.declaredValue
                        }
                        id={`${field.id}-declared`}
                        inputMode="decimal"
                        placeholder="Sin especificar"
                        readOnly={attempted}
                        {...form.register(`documents.${index}.declaredValue`)}
                      />
                      <p
                        className={CAI_ERROR}
                        id={`${field.id}-declared-error`}
                      >
                        {
                          form.formState.errors.documents?.[index]
                            ?.declaredValue?.message
                        }
                      </p>
                    </div>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm">
                      Ver productos — Total{" "}
                      {formatCurrency(
                        plan.documents[index].total,
                        plan.header.currency
                      )}
                    </summary>
                    <ul className="mt-2 space-y-1 text-sm">
                      {plan.documents[index].lines.map((line) => (
                        <li key={line.line_position}>
                          {line.quantity} × {line.product_name}{" "}
                          {line.variant_name}
                        </li>
                      ))}
                    </ul>
                  </details>
                </section>
              ))}
              {attempted && error && (
                <p className="text-muted-foreground text-xs">
                  El reintento conserva los datos y la identidad de esta
                  confirmación. Para corregirlos, cerrá el diálogo y volvé a
                  preparar; si el despacho ya se confirmó, aparecerá al
                  actualizar la página.
                </p>
              )}
              <DialogFooter>
                <Button
                  disabled={pending}
                  onClick={() => setOpen(false)}
                  type="button"
                  variant="outline"
                >
                  Cerrar
                </Button>
                <Button
                  className={CAI_PRIMARY_ACTION}
                  disabled={pending}
                  type="submit"
                >
                  {pending ? "Confirmando…" : confirmationLabel}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
