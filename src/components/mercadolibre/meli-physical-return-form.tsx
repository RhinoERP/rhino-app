"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  type FieldArrayWithId,
  type UseFormReturn,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateOnly } from "@/lib/format";
import {
  createMeliPhysicalReturnAction,
  getMeliPhysicalReturnFormAction,
} from "@/modules/mercadolibre/actions/meli-physical-return.action";
import type {
  MeliPhysicalReturnFormData,
  MeliPhysicalReturnSource,
} from "@/modules/mercadolibre/service/meli-physical-return.service";
import {
  buildMeliPhysicalReturnPlan,
  createMeliPhysicalReturnSchema,
  type MeliPhysicalReturnInput,
} from "@/modules/mercadolibre/utils/physical-return-plan";

type Validated = z.output<typeof createMeliPhysicalReturnSchema>;
const quantityFormat = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 6,
});

function SelectedReturnLines({
  fields,
  origins,
  form,
  onRemove,
}: {
  fields: FieldArrayWithId<MeliPhysicalReturnInput, "items", "id">[];
  origins: Record<string, MeliPhysicalReturnSource>;
  form: UseFormReturn<MeliPhysicalReturnInput, unknown, Validated>;
  onRemove: (index: number) => void;
}) {
  const selected = useWatch({ control: form.control, name: "items" });
  return (
    <div className="space-y-3">
      {fields.map((field, index) => {
        const origin = origins[field.sourceMovementId];
        if (!origin) {
          return null;
        }
        return (
          <div
            className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-4"
            key={field.id}
          >
            <div className="space-y-2 sm:col-span-4">
              <p className="font-medium text-sm">
                {origin.name} · Lote {origin.lotNumber}
              </p>
              <p className="text-muted-foreground text-xs">
                Disponible de esta salida:{" "}
                {quantityFormat.format(origin.remainingQuantity)}{" "}
                {origin.unitOfMeasure ?? "de stock"}
                {origin.tracksUnits
                  ? ` y ${quantityFormat.format(origin.remainingUnits)} piezas`
                  : ""}
                .
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`return-quantity-${field.id}`}>
                Cantidad ({origin.unitOfMeasure ?? "stock"})
              </Label>
              <Input
                id={`return-quantity-${field.id}`}
                min={0}
                step={origin.integerQuantity ? 1 : "0.000001"}
                type="number"
                {...form.register(`items.${index}.quantity`, {
                  valueAsNumber: true,
                })}
              />
            </div>
            {origin.tracksUnits && (
              <div className="space-y-2">
                <Label htmlFor={`return-units-${field.id}`}>Piezas</Label>
                <Input
                  id={`return-units-${field.id}`}
                  min={0}
                  step={1}
                  type="number"
                  {...form.register(`items.${index}.unitQuantity`, {
                    valueAsNumber: true,
                  })}
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                disabled={!(origin.restockAllowed || selected[index]?.restock)}
                type="checkbox"
                {...form.register(`items.${index}.restock`)}
              />
              Reponer stock vendible
            </label>
            <Button
              onClick={() => onRemove(index)}
              type="button"
              variant="ghost"
            >
              Quitar
            </Button>
            {!origin.restockAllowed && (
              <p className="text-muted-foreground text-xs sm:col-span-4">
                La unidad histórica no se pudo conciliar con el producto actual.
                Podés registrar la recepción sin reponer stock; Inventario debe
                revisar el reingreso.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReturnFormFooter({
  hasErrors,
  error,
  locked,
  pending,
  loading,
  isEmpty,
  destinationUnavailable,
  savedId,
  orgSlug,
  saleId,
}: {
  hasErrors: boolean;
  error: string;
  locked: boolean;
  pending: boolean;
  loading: boolean;
  isEmpty: boolean;
  destinationUnavailable: boolean;
  savedId: string | null;
  orgSlug: string;
  saleId: string;
}) {
  const submitLabel = locked
    ? "Conciliar el mismo intento"
    : "Confirmar recepción física";
  return (
    <>
      {hasErrors && (
        <p className="text-destructive text-sm" role="alert">
          Indicá fecha, motivo de al menos cinco caracteres y cantidades válidas
          para una o más salidas.
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {locked && (
        <p className="text-muted-foreground text-sm">
          Se conservan la clave y las cantidades del intento. Conciliar
          consulta/confirma la misma recepción, sin duplicar el reingreso.
        </p>
      )}
      <Button
        disabled={
          pending || loading || (!locked && (isEmpty || destinationUnavailable))
        }
        type="submit"
      >
        {pending ? "Confirmando…" : submitLabel}
      </Button>
      {savedId && (
        <p className="text-sm">
          <Link
            className="font-medium hover:underline"
            href={`/org/${orgSlug}/venta-directa/mercado-libre/${saleId}/devoluciones/${savedId}`}
          >
            Ver devolución registrada
          </Link>
        </p>
      )}
    </>
  );
}

export function MeliPhysicalReturnForm({
  orgSlug,
  initialData,
  onClose,
  onSaved,
}: {
  orgSlug: string;
  initialData: MeliPhysicalReturnFormData;
  onClose: () => void;
  onSaved: (returnId: string) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [data, setData] = useState(initialData);
  const [origins, setOrigins] = useState<
    Record<string, MeliPhysicalReturnSource>
  >({});
  const [pending, startTransition] = useTransition();
  const [loading, startLoading] = useTransition();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const running = useRef(false);
  const reading = useRef(false);
  const attempt = useRef<Validated | null>(null);
  const form = useForm<MeliPhysicalReturnInput, unknown, Validated>({
    resolver: zodResolver(createMeliPhysicalReturnSchema),
    defaultValues: {
      saleId: data.saleId,
      idempotencyKey: "",
      returnDate: format(new Date(), "yyyy-MM-dd"),
      reason: "",
      allowDefaultFallback: false,
      items: [],
    },
  });
  const lines = useFieldArray({ control: form.control, name: "items" });
  const selected = lines.fields;
  const disabled = pending || locked;
  const destinationUnavailable = !(
    data.sourceWarehouse.isActive || data.fallbackWarehouse
  );

  function loadPage(page: number) {
    if (reading.current || attempt.current || running.current) {
      return;
    }
    reading.current = true;
    startLoading(async () => {
      try {
        const result = await getMeliPhysicalReturnFormAction(
          orgSlug,
          data.saleId,
          page
        );
        if (!result.success) {
          setError(result.error);
          return;
        }
        setData(result.data);
        setOrigins((previous) => {
          const next = { ...previous };
          for (const origin of result.data.origins.data) {
            if (next[origin.movementId]) {
              next[origin.movementId] = origin;
            }
          }
          return next;
        });
        setError("");
      } catch {
        setError(
          "No se pudieron actualizar las salidas originales. Reintentá la consulta."
        );
      } finally {
        reading.current = false;
      }
    });
  }

  function confirm(values: Validated) {
    if (running.current) {
      return;
    }
    running.current = true;
    attempt.current ??= structuredClone(values);
    setLocked(true);
    setError("");
    startTransition(async () => {
      let committed = false;
      try {
        const result = await createMeliPhysicalReturnAction(
          orgSlug,
          attempt.current
        );
        if (!result.success) {
          setError(result.error);
          if (result.canEdit) {
            attempt.current = null;
            setLocked(false);
          }
          return;
        }
        committed = true;
        await finishReceipt(result.data);
      } catch {
        setError(
          committed
            ? "La devolución está registrada. Actualizá el detalle para consultar su recepción y disponibilidad."
            : "No se obtuvo la respuesta. Conciliá el mismo intento; sus cantidades y clave se conservan."
        );
      } finally {
        running.current = false;
      }
    });
  }

  async function finishReceipt(receipt: {
    returnId: string;
    idempotent: boolean;
  }) {
    setSavedId(receipt.returnId);
    attempt.current = null;
    setLocked(false);
    form.reset({
      saleId: data.saleId,
      idempotencyKey: "",
      returnDate: format(new Date(), "yyyy-MM-dd"),
      reason: "",
      allowDefaultFallback: false,
      items: [],
    });
    setOrigins({});
    toast.success(
      receipt.idempotent
        ? "Devolución recuperada sin duplicar el reingreso."
        : "Devolución física registrada."
    );
    onSaved(receipt.returnId);
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: ["org", orgSlug, "stock"] }),
      queryClient.invalidateQueries({
        queryKey: ["org", orgSlug, "stock-metrics"],
      }),
    ]);
    router.refresh();
    running.current = false;
    loadPage(data.origins.page);
  }

  function submit(values: Validated) {
    if (attempt.current) {
      confirm(attempt.current);
      return;
    }
    try {
      const sources = values.items.map((item) => {
        const origin = origins[item.sourceMovementId];
        if (!origin) {
          throw new Error(
            "Actualizá las salidas originales antes de confirmar."
          );
        }
        if (item.restock && !origin.restockAllowed) {
          throw new Error(
            `Inventario debe revisar la unidad de ${origin.name} antes de reponer stock.`
          );
        }
        if (origin.integerQuantity && !Number.isInteger(item.quantity)) {
          throw new Error(`La cantidad de ${origin.name} debe ser entera.`);
        }
        return origin;
      });
      buildMeliPhysicalReturnPlan(values, sources);
      confirm(values);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Revisá las cantidades de la devolución."
      );
    }
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Registrar mercadería recibida</h3>
        <Button
          disabled={disabled || loading}
          onClick={() => {
            if (!(attempt.current || running.current || reading.current)) {
              onClose();
            }
          }}
          type="button"
          variant="ghost"
        >
          Cerrar formulario
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Origen: {data.sourceWarehouse.name}. Elegí las salidas y lotes
        efectivamente recibidos. Registrar esta recepción no emite una NC ni
        devuelve dinero.
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Producto / lote original</th>
              <th className="p-2">Pendiente de recibir</th>
              <th className="p-2">Piezas pendientes</th>
              <th className="p-2">Selección</th>
            </tr>
          </thead>
          <tbody>
            {data.origins.data.map((origin) => {
              const isSelected = selected.some(
                (item) => item.sourceMovementId === origin.movementId
              );
              const exhausted =
                origin.remainingQuantity === 0 && origin.remainingUnits === 0;
              return (
                <tr className="border-b last:border-0" key={origin.movementId}>
                  <td className="p-2">
                    <p>{origin.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {origin.sku} · Lote {origin.lotNumber}
                      {origin.expirationDate
                        ? ` · Vence ${formatDateOnly(origin.expirationDate)}`
                        : ""}
                    </p>
                  </td>
                  <td className="p-2">
                    {quantityFormat.format(origin.remainingQuantity)}{" "}
                    {origin.unitOfMeasure ?? "de stock"}
                  </td>
                  <td className="p-2">
                    {origin.tracksUnits
                      ? quantityFormat.format(origin.remainingUnits)
                      : "—"}
                  </td>
                  <td className="p-2">
                    <Button
                      disabled={
                        disabled ||
                        loading ||
                        isSelected ||
                        exhausted ||
                        lines.fields.length >= 500
                      }
                      onClick={() => {
                        setOrigins((previous) => ({
                          ...previous,
                          [origin.movementId]: origin,
                        }));
                        lines.append({
                          sourceMovementId: origin.movementId,
                          quantity: origin.remainingQuantity,
                          unitQuantity: origin.remainingUnits,
                          restock: origin.restockAllowed,
                        });
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {isSelected ? "Agregada" : "Agregar"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.origins.data.length && (
          <p className="p-4 text-muted-foreground text-sm">
            No hay salidas originales en esta página.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          Página {data.origins.page} · {data.origins.totalCount} salidas
          originales
        </span>
        <Button
          disabled={disabled || loading || data.origins.page <= 1}
          onClick={() => loadPage(data.origins.page - 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Anterior
        </Button>
        <Button
          disabled={
            disabled ||
            loading ||
            data.origins.page * data.origins.pageSize >= data.origins.totalCount
          }
          onClick={() => loadPage(data.origins.page + 1)}
          size="sm"
          type="button"
          variant="outline"
        >
          Siguiente
        </Button>
        <Button
          disabled={disabled || loading}
          onClick={() => loadPage(data.origins.page)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {loading ? "Actualizando…" : "Actualizar disponibilidad"}
        </Button>
      </div>
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          if (attempt.current) {
            event.preventDefault();
            confirm(attempt.current);
            return;
          }
          if (!form.getValues("idempotencyKey")) {
            form.setValue("idempotencyKey", crypto.randomUUID());
          }
          form.handleSubmit(submit)(event);
        }}
      >
        <fieldset className="space-y-4" disabled={disabled || loading}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meli-return-date">Fecha de recepción</Label>
              <Input
                id="meli-return-date"
                type="date"
                {...form.register("returnDate")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meli-return-reason">
                Motivo / condición de la mercadería
              </Label>
              <Input
                id="meli-return-reason"
                maxLength={500}
                {...form.register("reason")}
              />
            </div>
          </div>
          {data.fallbackWarehouse &&
            data.fallbackWarehouse.id !== data.sourceWarehouse.id && (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  {...form.register("allowDefaultFallback")}
                />
                Si el depósito original está inactivo, recibir en el principal:{" "}
                {data.fallbackWarehouse.name}.
              </label>
            )}
          {!data.sourceWarehouse.isActive && (
            <p className="text-sm">
              El depósito original está inactivo. La recepción requiere el
              principal activo y asignado, con la opción anterior seleccionada.
            </p>
          )}
          {destinationUnavailable && (
            <p className="text-destructive text-sm">
              No hay un depósito principal activo asignado para recibir esta
              mercadería.
            </p>
          )}
          <SelectedReturnLines
            fields={lines.fields}
            form={form}
            onRemove={lines.remove}
            origins={origins}
          />
        </fieldset>
        <ReturnFormFooter
          destinationUnavailable={destinationUnavailable}
          error={error}
          hasErrors={Object.keys(form.formState.errors).length > 0}
          isEmpty={lines.fields.length === 0}
          loading={loading}
          locked={locked}
          orgSlug={orgSlug}
          pending={pending}
          saleId={data.saleId}
          savedId={savedId}
        />
      </form>
    </div>
  );
}
