"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, FileCheck2Icon, RefreshCwIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { CAI_ERROR, CAI_PRIMARY_ACTION } from "@/components/arca/cai-ui-styles";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  activateCaiAction,
  getCaiSummaryAction,
  importCaiAction,
  reconcileCaiOperationAction,
  refreshCaiOperationAction,
  saveCaiSettingsAction,
  startCaiOperationAction,
} from "@/modules/arca/actions/cai.actions";
import {
  authorizationAvailability,
  type CaiActivation,
  type CaiOperation,
  type CaiSettings,
  caiSettingsSchema,
  formatFiscalRemittanceNumber,
} from "@/modules/arca/cai";
import {
  canReconcileCaiOperation,
  hasCaiCancellationValidation,
  hasCaiRequestValidation,
} from "@/modules/arca/cai-ui";
import type { CaiSummary } from "@/modules/arca/server/cai.service";
import { CaiAuthorizationDialog } from "./cai-authorization-dialog";
import { CaiField, type CaiUiResult } from "./cai-field";
import { CaiReconciliationDialog } from "./cai-operation-dialog";
import { CaiUsageExport } from "./cai-usage-export";

const operationLabels: Record<CaiOperation["kind"], string> = {
  validate: "Validación de solicitud",
  request: "Solicitud de CAI",
  check_cancel: "Validación de anulación",
  cancel: "Anulación de CAI",
};
const operationStates: Record<CaiOperation["state"], string> = {
  starting: "Iniciando",
  pending: "En proceso",
  complete: "Completada",
  uncertain: "Requiere revisión",
  failed: "Sin aplicar",
};

function FiscalSettingsForm({
  settings,
  pending,
  onSave,
  onDirtyChange,
}: {
  settings: CaiSettings | null;
  pending: boolean;
  onSave: (value: CaiSettings) => Promise<CaiUiResult>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const modeId = useId();
  const enabledId = useId();
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-4"
      onChange={() => onDirtyChange(true)}
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const parsed = caiSettingsSchema.safeParse({
          enabled,
          mode: data.get("mode"),
          loginCuit: data.get("loginCuit"),
          pointOfSale: Number(data.get("pointOfSale")),
          businessName: data.get("businessName"),
          address: data.get("address"),
          vatCondition: data.get("vatCondition"),
          grossIncome: data.get("grossIncome"),
          activityStart: data.get("activityStart"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0].message);
          return;
        }
        setError("");
        const result = await onSave(parsed.data);
        if (result.success) {
          onDirtyChange(false);
        } else {
          setError(result.error);
        }
      }}
    >
      <fieldset className="space-y-4" disabled={pending}>
        <div className="grid gap-4 sm:grid-cols-2">
          <CaiField
            defaultValue={settings?.loginCuit ?? ""}
            description="La clave fiscal de este usuario debe estar guardada en nuestro proyecto de AFIP SDK y tener acceso a la empresa."
            inputMode="numeric"
            label="CUIT de acceso a ARCA"
            maxLength={11}
            name="loginCuit"
            pattern="[0-9]{11}"
            required
          />
          <CaiField
            defaultValue={settings?.pointOfSale}
            description="Usá el punto habilitado para remitos; puede ser distinto al de facturación electrónica."
            label="Punto de venta de remitos"
            max={99_999}
            min={1}
            name="pointOfSale"
            required
            type="number"
          />
          <div className="space-y-2">
            <Label htmlFor={modeId}>Emisión del remito</Label>
            <Select
              defaultValue={settings?.mode ?? "self_printed"}
              disabled={pending}
              name="mode"
              onValueChange={() => onDirtyChange(true)}
            >
              <SelectTrigger className="w-full" id={modeId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self_printed">
                  Documento completo desde Rhino
                </SelectItem>
                <SelectItem value="preprinted">
                  Formulario preimpreso por imprenta
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <CaiField
            defaultValue={settings?.businessName ?? ""}
            label="Razón social del emisor"
            maxLength={200}
            name="businessName"
            required
          />
          <CaiField
            defaultValue={settings?.address ?? ""}
            label="Domicilio comercial"
            maxLength={300}
            name="address"
            required
          />
          <CaiField
            defaultValue={settings?.vatCondition ?? ""}
            label="Condición frente al IVA"
            maxLength={80}
            name="vatCondition"
            placeholder="Ej.: IVA RESPONSABLE INSCRITO"
            required
          />
          <CaiField
            defaultValue={settings?.grossIncome ?? ""}
            label="Ingresos Brutos"
            maxLength={80}
            name="grossIncome"
            placeholder="Número de inscripción o no contribuyente"
            required
          />
          <CaiField
            defaultValue={settings?.activityStart ?? ""}
            label="Inicio de actividad"
            name="activityStart"
            required
            type="date"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="min-w-0 space-y-1">
            <Label htmlFor={enabledId}>Emitir remitos con CAI</Label>
            <p className="text-muted-foreground text-sm">
              Al habilitarlo, los despachos requieren una autorización activa y
              reciben su número fiscal al confirmar.
            </p>
          </div>
          <Switch
            checked={enabled}
            className="shrink-0"
            disabled={pending}
            id={enabledId}
            onCheckedChange={(value) => {
              setEnabled(value);
              onDirtyChange(true);
            }}
          />
        </div>
      </fieldset>
      {error && (
        <p className={CAI_ERROR} role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button className={CAI_PRIMARY_ACTION} disabled={pending} type="submit">
          {pending ? "Guardando…" : "Guardar datos fiscales"}
        </Button>
      </div>
    </form>
  );
}

type Result = Awaited<ReturnType<typeof getCaiSummaryAction>>;

function caiView(summary: CaiSummary | undefined, quantity: number) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const active = summary?.authorizations.find(
    (authorization) => authorization.state === "active"
  );
  const availability: ReturnType<typeof authorizationAvailability> = active
    ? authorizationAvailability(active, today)
    : "inactive";
  const lastUsed = Math.max(
    0,
    ...(summary?.authorizations.map(
      (authorization) => (authorization.next_number ?? 1) - 1
    ) ?? [])
  );
  const validated = hasCaiRequestValidation({
    operations: summary?.operations ?? [],
    settings: summary?.settings ?? null,
    cuit: summary?.cuit ?? null,
    quantity,
  });
  return { active, availability, lastUsed, validated };
}

export function CaiSettingsPanel({ orgSlug }: { orgSlug: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["remittance-cai", orgSlug];
  const [dirty, setDirty] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const requestKey = useRef<string | null>(null);
  const requestShape = useRef("");
  const query = useQuery({
    queryKey,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const result = await getCaiSummaryAction(orgSlug);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });
  const summary = query.data;
  const unresolved = summary?.operations.find((operation) =>
    ["starting", "pending", "uncertain"].includes(operation.state)
  );

  const execute = async (
    action: () => Promise<Result>,
    message?: string
  ): Promise<CaiUiResult> => {
    if (pendingRef.current) {
      return {
        success: false,
        error: "Esperá a que termine la operación en curso.",
      };
    }
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      await queryClient.cancelQueries({ queryKey });
      const result = await action();
      if (!result.success) {
        setError(result.error);
        return { success: false, error: result.error };
      }
      queryClient.setQueryData(queryKey, result.data);
      await queryClient.invalidateQueries({
        queryKey: ["org", orgSlug, "settings"],
      });
      if (message) {
        toast.success(message);
      }
      return { success: true };
    } catch {
      setError(
        "No se pudo obtener la respuesta. Actualizá el estado antes de repetir el trámite."
      );
      return {
        success: false,
        error:
          "No se pudo obtener la respuesta. Actualizá el estado antes de repetir el trámite.",
      };
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  // Short requests plus persisted provider IDs survive navigation and server-action timeouts.
  useEffect(() => {
    if (!(unresolved?.provider_id && unresolved.state === "pending")) {
      return;
    }
    let running = false;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (running || pendingRef.current) {
        return;
      }
      running = true;
      try {
        const result = await refreshCaiOperationAction(orgSlug, unresolved.id);
        if (result.success && !cancelled && !pendingRef.current) {
          queryClient.setQueryData(["remittance-cai", orgSlug], result.data);
        }
      } catch {
        // The persisted attempt stays available for the next poll or a manual refresh.
      } finally {
        running = false;
      }
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    orgSlug,
    queryClient,
    unresolved?.id,
    unresolved?.provider_id,
    unresolved?.state,
  ]);

  const start = async (
    kind: CaiOperation["kind"],
    authorizationId?: string,
    quantity = 50
  ) => {
    const shape = JSON.stringify({ kind, authorizationId, quantity });
    if (requestShape.current !== shape) {
      requestKey.current = null;
      requestShape.current = shape;
    }
    requestKey.current ??= crypto.randomUUID();
    const success = await execute(() =>
      startCaiOperationAction(orgSlug, {
        kind,
        quantity,
        authorizationId,
        requestKey: requestKey.current ?? "",
      })
    );
    if (success.success) {
      requestKey.current = null;
    }
    return success;
  };
  const { lastUsed } = caiView(summary, 50);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileCheck2Icon className="size-5 shrink-0" />
          Remitos con CAI
        </CardTitle>
        <CardDescription>
          Configurá la autorización de ARCA para emitir remitos R desde Rhino.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {query.isPending && (
          <div
            aria-busy="true"
            className="h-32 animate-pulse rounded-md bg-muted"
          />
        )}
        {query.isError && (
          <div className="space-y-2" role="alert">
            <p className={CAI_ERROR}>{query.error.message}</p>
            <Button
              onClick={() => query.refetch()}
              type="button"
              variant="outline"
            >
              Reintentar
            </Button>
          </div>
        )}
        {summary && (
          <>
            <CaiStatus
              busy={pending || dirty || query.isFetching}
              onRefresh={() => query.refetch()}
              summary={summary}
            />
            <div className="space-y-4">
              <div>
                <h3 className="font-medium">1. Acceso y datos del emisor</h3>
                <p className="text-muted-foreground text-sm">
                  Guardá la clave fiscal una vez en AFIP SDK. Después, Rhino usa
                  el CUIT de acceso para los trámites.
                </p>
                <a
                  className="mt-2 inline-flex items-center gap-1 text-blue-700 text-sm underline underline-offset-4 dark:text-blue-300"
                  href="https://app.afipsdk.com"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Abrir AFIP SDK
                  <ExternalLinkIcon className="size-3" />
                </a>
              </div>
              <FiscalSettingsForm
                key={JSON.stringify(summary.settings)}
                onDirtyChange={setDirty}
                onSave={(value) =>
                  execute(
                    () => saveCaiSettingsAction(orgSlug, value),
                    "Datos fiscales guardados"
                  )
                }
                pending={pending || !!unresolved}
                settings={summary.settings}
              />
            </div>
            {dirty && (
              <p
                aria-live="polite"
                className="rounded-md border bg-muted/40 p-3 text-sm"
              >
                Tenés cambios sin guardar. Guardá los datos fiscales antes de
                validar, solicitar o activar un CAI.
              </p>
            )}
            <CaiRequestSection
              blocked={!!unresolved || dirty}
              onImport={(value) =>
                execute(
                  () => importCaiAction(orgSlug, value),
                  "CAI cargado; verificá los datos para activarlo"
                )
              }
              onStart={(kind, amount) => start(kind, undefined, amount)}
              pending={pending}
              summary={summary}
            />
            {unresolved && (
              <div
                aria-live="polite"
                className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
              >
                <p className="font-medium text-sm">
                  {operationLabels[unresolved.kind]} ·{" "}
                  {operationStates[unresolved.state]}
                </p>
                <p className="text-sm">
                  {unresolved.error ??
                    "El trámite está en curso. Podés salir de esta pantalla y consultar el resultado después."}
                </p>
                <div className="flex flex-wrap gap-2">
                  {unresolved.provider_id && (
                    <Button
                      disabled={pending}
                      onClick={() =>
                        execute(() =>
                          refreshCaiOperationAction(orgSlug, unresolved.id)
                        )
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Consultar resultado
                    </Button>
                  )}
                  {canReconcileCaiOperation(unresolved, now) && (
                    <CaiReconciliationDialog
                      onReconcile={(value) =>
                        execute(
                          () => reconcileCaiOperationAction(orgSlug, value),
                          "Resultado registrado"
                        )
                      }
                      operation={unresolved}
                      pending={pending}
                    />
                  )}
                </div>
              </div>
            )}
            <CaiAuthorizations
              blocked={!!unresolved || dirty}
              lastUsed={lastUsed}
              onActivate={(value) =>
                execute(
                  () => activateCaiAction(orgSlug, value),
                  "Autorización activada"
                )
              }
              onStart={start}
              pending={pending}
              summary={summary}
            />
            <CaiUsageExport orgSlug={orgSlug} />
            {summary.operations.length > 0 && (
              <details className="border-t pt-4">
                <summary className="cursor-pointer font-medium text-sm">
                  Historial de trámites
                </summary>
                <div className="mt-3 space-y-2">
                  {summary.operations.map((operation) => (
                    <div
                      className="min-w-0 space-y-1 break-words rounded-md bg-muted/40 p-3 text-sm"
                      key={operation.id}
                    >
                      <p>
                        {operationLabels[operation.kind]} ·{" "}
                        {operationStates[operation.state]}
                      </p>
                      <p className="break-words text-muted-foreground text-xs">
                        {operation.created_at.slice(0, 10)}
                        {operation.provider_id
                          ? ` · Referencia ${operation.provider_id}`
                          : ""}
                      </p>
                      {operation.error && (
                        <p className="text-sm">{operation.error}</p>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
        {error && (
          <p className={CAI_ERROR} role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ConfirmCaiAction({
  label,
  title,
  description,
  disabled,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  disabled: boolean;
  onConfirm: () => Promise<CaiUiResult>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  return (
    <AlertDialog
      onOpenChange={(value) => {
        if (!pendingRef.current) {
          setOpen(value);
          setError("");
        }
      }}
      open={open}
    >
      <AlertDialogTrigger asChild>
        <Button disabled={disabled} type="button" variant="outline">
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className={CAI_ERROR} role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
          <AlertDialogAction
            className={CAI_PRIMARY_ACTION}
            disabled={pending || disabled}
            onClick={async (event) => {
              event.preventDefault();
              if (pendingRef.current) {
                return;
              }
              pendingRef.current = true;
              setPending(true);
              setError("");
              try {
                const result = await onConfirm();
                if (result.success) {
                  setOpen(false);
                } else {
                  setError(result.error);
                }
              } catch {
                setError(
                  "No se pudo obtener la respuesta. Actualizá el estado antes de repetir el trámite."
                );
              } finally {
                pendingRef.current = false;
                setPending(false);
              }
            }}
          >
            {pending ? "Procesando…" : label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CaiAuthorizations({
  summary,
  lastUsed,
  pending,
  blocked,
  onActivate,
  onStart,
}: {
  summary: CaiSummary;
  lastUsed: number;
  pending: boolean;
  blocked: boolean;
  onActivate: (input: CaiActivation) => Promise<CaiUiResult>;
  onStart: (kind: CaiOperation["kind"], id: string) => Promise<CaiUiResult>;
}) {
  return (
    <section className="space-y-3 border-t pt-5">
      <h3 className="font-medium">3. Autorizaciones y numeración</h3>
      {!summary.authorizations.length && (
        <p className="text-muted-foreground text-sm">
          Todavía no hay autorizaciones. Cuando cargues o solicites un CAI,
          aparecerá acá para verificarlo y activarlo.
        </p>
      )}
      {summary.authorizations.map((authorization) => {
        const cancellable = hasCaiCancellationValidation(
          summary.operations,
          authorization.cai
        );
        return (
          <div
            className="flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"
            key={authorization.id}
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{authorization.cai}</span>
                <Badge
                  className={
                    authorization.state === "active"
                      ? CAI_PRIMARY_ACTION
                      : undefined
                  }
                  variant={
                    authorization.state === "active" ? "default" : "secondary"
                  }
                >
                  {
                    {
                      draft: "Pendiente de activar",
                      active: "Activo",
                      replaced: "Reemplazado",
                      cancelled: "Anulado",
                    }[authorization.state]
                  }
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">
                Punto {authorization.point_of_sale} · Vence{" "}
                {authorization.expires_at.split("-").reverse().join("/")} ·{" "}
                {authorization.issued_count} emitidos
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {authorization.state === "draft" && (
                <CaiAuthorizationDialog
                  authorization={authorization}
                  lastUsed={lastUsed}
                  onActivate={(value) => onActivate(value)}
                  pending={pending || blocked}
                />
              )}
              {["draft", "active"].includes(authorization.state) &&
                authorization.issued_count === 0 &&
                (cancellable ? (
                  <ConfirmCaiAction
                    description={`ARCA anulará el CAI ${authorization.cai}. La anulación es irreversible y no anula remitos individuales.`}
                    disabled={pending || blocked}
                    label="Anular CAI"
                    onConfirm={() => onStart("cancel", authorization.id)}
                    title="Anular autorización de impresión"
                  />
                ) : (
                  <Button
                    disabled={pending || blocked}
                    onClick={() => onStart("check_cancel", authorization.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Verificar anulación
                  </Button>
                ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function CaiRequestSection({
  summary,
  pending,
  blocked,
  onImport,
  onStart,
}: {
  summary: CaiSummary;
  pending: boolean;
  blocked: boolean;
  onImport: (value: { cai: string; expiresAt: string }) => Promise<CaiUiResult>;
  onStart: (
    kind: "request" | "validate",
    quantity: number
  ) => Promise<CaiUiResult>;
}) {
  const [quantityText, setQuantityText] = useState("50");
  const quantity = Number(quantityText);
  const [importError, setImportError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const quantityId = useId();
  const { validated } = caiView(summary, quantity);
  return (
    <section className="space-y-4 border-t pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">2. Autorización de ARCA</h3>
          <p className="text-muted-foreground text-sm">
            Validá el acceso antes de solicitar un CAI, o cargá una autorización
            existente.
          </p>
        </div>
        <Button
          disabled={pending || (!importOpen && (!summary.settings || blocked))}
          onClick={() => {
            setImportOpen(!importOpen);
            setImportError("");
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {importOpen ? "Cerrar carga" : "Cargar CAI existente"}
        </Button>
      </div>
      {importOpen && (
        <form
          className="space-y-4 rounded-lg border p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setImportError("");
            const result = await onImport({
              cai: String(data.get("cai")),
              expiresAt: String(data.get("expiresAt")),
            });
            if (result.success) {
              setImportOpen(false);
            } else {
              setImportError(result.error);
            }
          }}
        >
          <fieldset
            className="grid gap-4 sm:grid-cols-2"
            disabled={pending || blocked}
          >
            <CaiField
              inputMode="numeric"
              label="CAI"
              maxLength={14}
              name="cai"
              pattern="[0-9]{14}"
              required
            />
            <CaiField
              label="Vencimiento"
              name="expiresAt"
              required
              type="date"
            />
          </fieldset>
          {importError && (
            <p className={CAI_ERROR} role="alert">
              {importError}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              className={CAI_PRIMARY_ACTION}
              disabled={pending || blocked}
              type="submit"
            >
              Guardar autorización
            </Button>
          </div>
        </form>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full space-y-2 sm:max-w-48">
          <Label htmlFor={quantityId}>Cantidad solicitada</Label>
          <Input
            disabled={pending || blocked}
            id={quantityId}
            max={99_999_999}
            min={1}
            onChange={(event) => {
              setQuantityText(event.target.value);
            }}
            type="number"
            value={quantityText}
          />
        </div>
        <Button
          disabled={
            pending ||
            blocked ||
            !summary.settings ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 99_999_999
          }
          onClick={() => onStart("validate", quantity)}
          type="button"
          variant="outline"
        >
          Validar en ARCA
        </Button>
        <ConfirmCaiAction
          description={`Se solicitará un CAI para ${quantity} remitos R del punto de venta ${summary.settings?.pointOfSale ?? ""}. El trámite se realiza en ARCA; después deberás verificar la constancia para activar la autorización.`}
          disabled={pending || blocked || !validated}
          label="Solicitar CAI"
          onConfirm={() => onStart("request", quantity)}
          title="Solicitar autorización a ARCA"
        />
      </div>
      <p className="break-words text-muted-foreground text-xs">
        La validación no emite un CAI. La solicitud usa el formato documentado
        por AFIP SDK; su aceptación depende de la habilitación del emisor y del
        punto de venta.
      </p>
    </section>
  );
}

function CaiStatus({
  summary,
  busy,
  onRefresh,
}: {
  summary: CaiSummary;
  busy: boolean;
  onRefresh: () => void;
}) {
  const { active, availability } = caiView(summary, 50);
  const stateLabels = {
    available: "Listo para emitir",
    expired: "CAI vencido",
    exhausted: "Numeración agotada",
    incomplete: "Faltan datos",
    inactive: "Sin CAI activo",
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {summary.settings?.enabled
            ? stateLabels[availability]
            : "Emisión con CAI deshabilitada"}
        </p>
        <p className="break-words text-muted-foreground text-sm">
          CUIT emisor: {summary.cuit ?? "Sin configurar"}
          {active &&
            ` · CAI ${active.cai} · Vence ${active.expires_at.split("-").reverse().join("/")}`}
        </p>
        {active?.next_number && availability === "available" && (
          <p className="text-sm">
            Próximo remito:{" "}
            <span className="font-mono">
              {formatFiscalRemittanceNumber(
                active.point_of_sale,
                active.next_number
              )}
            </span>
            {active.last_number !== null &&
              ` · ${Math.max(0, active.last_number - active.next_number + 1)} disponibles`}
          </p>
        )}
      </div>
      <Button
        aria-label="Actualizar estado de CAI"
        disabled={busy}
        onClick={onRefresh}
        size="icon"
        type="button"
        variant="outline"
      >
        <RefreshCwIcon className="size-4" />
      </Button>
    </div>
  );
}
