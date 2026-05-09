"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarIcon,
  IdentificationCardIcon,
  LightningIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { type ChangeEvent, type RefObject, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import { completeDelegatedArcaOnboardingAction } from "@/modules/arca/actions/complete-delegated-arca-onboarding.action";
import { saveArcaSettingsAction } from "@/modules/arca/actions/save-arca-settings.action";
import { testArcaConnectionAction } from "@/modules/arca/actions/test-arca-connection.action";
import type {
  ArcaConnectionStatus,
  ArcaConnectionTestResult,
  ArcaErrorDiagnostic,
  ArcaInvoiceAAuthorizationType,
  ArcaSettingsSummary,
  AutomaticSalesPointProfile,
} from "@/modules/arca/types";

const PEM_REGEX = /-----BEGIN [^-]+-----[\s\S]+-----END [^-]+-----/;
const ACCEPTED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ACCEPTED_LOGO_FILE_LABEL = "PNG, JPG o WebP";
const MAX_LOGO_FILE_SIZE_BYTES = 512 * 1024;

const formSchema = z
  .object({
    environment: z.enum(["dev", "prod"]),
    mode: z.enum(["delegated", "manual"]),
    pointOfSale: z
      .number()
      .int("El punto de venta debe ser un entero.")
      .positive("El punto de venta debe ser mayor a 0."),
    invoiceAAuthorizationType: z.enum([
      "standard",
      "operation_subject_to_withholding",
    ]),
    cert: z.string().optional(),
    key: z.string().optional(),
    issuerLogoDataUrl: z.string().nullable().optional(),
    issuerLegalAddress: z.string().max(180).nullable().optional(),
    representedCuit: z.string().optional(),
    login: z.string().optional(),
    password: z.string().optional(),
    salesPointProfile: z.enum(["monotributo_wsfe", "existing_wsfe_point"]),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "manual") {
      validateManualModeFields(value, ctx);
      return;
    }

    validateDelegatedModeFields(value, ctx);
  });

type FormValues = z.infer<typeof formSchema>;
type StatusBadgeVariant = "default" | "secondary" | "destructive" | "outline";
type ArcaSettingsFormController = ReturnType<typeof useForm<FormValues>>;

type ArcaSettingsFormProps = {
  orgSlug: string;
  initialSummary: ArcaSettingsSummary;
};

type PemFieldProps = {
  control: ArcaSettingsFormController["control"];
  fieldName: "cert" | "key";
  fileInputRef: RefObject<HTMLInputElement | null>;
  hasConfiguredCredentials: boolean;
  label: string;
  placeholder: string;
  uploadLabel: string;
  accept: string;
  onLoadFile: (
    event: ChangeEvent<HTMLInputElement>,
    field: "cert" | "key",
    label: string
  ) => void;
};

function validateManualModeFields(
  value: FormValues,
  ctx: z.RefinementCtx
): void {
  const cert = value.cert?.trim();
  const key = value.key?.trim();

  if (cert && !PEM_REGEX.test(cert)) {
    ctx.addIssue({
      code: "custom",
      message: "El certificado debe estar en formato PEM válido.",
      path: ["cert"],
    });
  }

  if (key && !PEM_REGEX.test(key)) {
    ctx.addIssue({
      code: "custom",
      message: "La clave privada debe estar en formato PEM válido.",
      path: ["key"],
    });
  }

  if ((cert && !key) || (!cert && key)) {
    ctx.addIssue({
      code: "custom",
      message:
        "Si cargás un secreto nuevo, debés cargar certificado y clave juntos.",
      path: cert ? ["key"] : ["cert"],
    });
  }
}

function validateDelegatedModeFields(
  value: FormValues,
  ctx: z.RefinementCtx
): void {
  const representedCuit = value.representedCuit?.replace(/\D/g, "") ?? "";

  if (representedCuit.length !== 11) {
    ctx.addIssue({
      code: "custom",
      message: "Ingresá un CUIT representado válido de 11 dígitos.",
      path: ["representedCuit"],
    });
  }

  if (!value.login?.trim()) {
    ctx.addIssue({
      code: "custom",
      message: "Ingresá el CUIT o usuario de acceso.",
      path: ["login"],
    });
  }

  if (!value.password?.trim()) {
    ctx.addIssue({
      code: "custom",
      message: "Ingresá la contraseña de ARCA.",
      path: ["password"],
    });
  }
}

function getStatusBadgeVariant(
  status: ArcaConnectionStatus | null
): StatusBadgeVariant {
  if (status === "connected") {
    return "default";
  }

  if (status === "error") {
    return "destructive";
  }

  if (status === "pending") {
    return "secondary";
  }

  return "outline";
}

function getStatusLabel(
  status: ArcaConnectionStatus | null,
  isConfigured: boolean
) {
  if (!isConfigured) {
    return "Sin configurar";
  }

  if (status === "connected") {
    return "Conectado";
  }

  if (status === "error") {
    return "Con error";
  }

  return "Pendiente de prueba";
}

function getEnvironmentLabel(environment: ArcaSettingsSummary["environment"]) {
  if (environment === "prod") {
    return "Producción";
  }

  if (environment === "dev") {
    return "Desarrollo";
  }

  return "-";
}

function getModeLabel(summary: ArcaSettingsSummary) {
  if (summary.mode === "delegated") {
    return "Delegado";
  }

  if (summary.mode === "manual") {
    return "Manual";
  }

  return "-";
}

function getSalesPointProfileLabel(profile: AutomaticSalesPointProfile) {
  if (profile === "monotributo_wsfe") {
    return "Monotributo WSFE";
  }

  return "Punto WSFE existente";
}

function getInvoiceAAuthorizationTypeLabel(
  value: ArcaInvoiceAAuthorizationType
) {
  if (value === "operation_subject_to_withholding") {
    return "A con leyenda operación sujeta a retención";
  }

  return "A estándar";
}

function getDiagnosticCodeLabel(code: ArcaErrorDiagnostic["code"]) {
  switch (code) {
    case "invalid_credentials":
      return "Credenciales inválidas";
    case "automation_timeout":
      return "Timeout de automatización";
    case "list_sales_points_failed":
      return "Falló la consulta de puntos de venta";
    case "unexpected_sales_points_response":
      return "Respuesta inesperada al listar puntos";
    case "create_sales_point_failed":
      return "Falló la creación del punto de venta";
    case "sales_point_not_found":
      return "Punto de venta no encontrado";
    case "sales_point_incompatible":
      return "Punto de venta incompatible";
    case "sales_point_blocked":
      return "Punto de venta bloqueado";
    case "sales_point_deactivated":
      return "Punto de venta dado de baja";
    case "represented_cuit_mismatch":
      return "CUIT representado distinto";
    case "missing_organization_cuit":
      return "Falta CUIT de organización";
    case "invalid_organization_cuit":
      return "CUIT inválido";
    case "operator_profile_missing":
      return "Falta perfil operador";
    case "operator_profile_invalid":
      return "Perfil operador inválido";
    case "delegate_web_service_failed":
      return "Falló la delegación WSFE";
    case "accept_web_service_delegation_failed":
      return "Falló la aceptación del operador";
    case "authorize_operator_wsfe_failed":
      return "Falló la autorización WSFE del operador";
    default:
      return "Error no clasificado";
  }
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.ceil(bytes / 1024)} KB`;
}

function buildDefaultValues(summary: ArcaSettingsSummary): FormValues {
  const mode = summary.mode ?? "delegated";

  return {
    environment: summary.environment ?? "dev",
    mode,
    pointOfSale: summary.pointOfSale ?? 1,
    invoiceAAuthorizationType: summary.invoiceAAuthorizationType,
    cert: "",
    key: "",
    issuerLogoDataUrl: summary.issuerLogoDataUrl ?? null,
    issuerLegalAddress: summary.issuerLegalAddress ?? "",
    representedCuit: summary.organizationCuit ?? "",
    login: "",
    password: "",
    salesPointProfile: "monotributo_wsfe",
  };
}

function syncSummaryState(params: {
  form: ArcaSettingsFormController;
  nextSummary: ArcaSettingsSummary;
  setSummary: (summary: ArcaSettingsSummary) => void;
}) {
  params.setSummary(params.nextSummary);
  params.form.setValue("environment", params.nextSummary.environment ?? "dev");
  params.form.setValue("pointOfSale", params.nextSummary.pointOfSale ?? 1);
  params.form.setValue(
    "invoiceAAuthorizationType",
    params.nextSummary.invoiceAAuthorizationType
  );
  params.form.setValue(
    "issuerLogoDataUrl",
    params.nextSummary.issuerLogoDataUrl ?? null
  );
  params.form.setValue(
    "issuerLegalAddress",
    params.nextSummary.issuerLegalAddress ?? ""
  );
  params.form.setValue(
    "representedCuit",
    params.nextSummary.organizationCuit ?? ""
  );
  params.form.setValue(
    "mode",
    params.nextSummary.mode ?? params.form.getValues("mode")
  );
}

function clearManualSecretInputs(params: {
  form: ArcaSettingsFormController;
  certFileInputRef: RefObject<HTMLInputElement | null>;
  keyFileInputRef: RefObject<HTMLInputElement | null>;
}) {
  params.form.setValue("cert", "");
  params.form.setValue("key", "");

  if (params.certFileInputRef.current) {
    params.certFileInputRef.current.value = "";
  }

  if (params.keyFileInputRef.current) {
    params.keyFileInputRef.current.value = "";
  }
}

function clearDelegatedCredentialInputs(form: ArcaSettingsFormController) {
  form.setValue("login", "");
  form.setValue("password", "");
}

function getPointOfSaleValidationLabel(
  pointOfSaleValidated: boolean | undefined
) {
  if (pointOfSaleValidated === undefined) {
    return "-";
  }

  return pointOfSaleValidated ? "Sí" : "No";
}

function getPrimarySubmitLabel(params: {
  isSavingManual: boolean;
  isDelegating: boolean;
  mode: FormValues["mode"];
}) {
  if (params.isSavingManual || params.isDelegating) {
    return null;
  }

  return params.mode === "delegated"
    ? "Delegar y conectar ARCA"
    : "Guardar configuración manual";
}

async function handleManualSaveRequest(params: {
  values: FormValues;
  hasConfiguredCredentials: boolean;
  form: ArcaSettingsFormController;
  orgSlug: string;
  syncSummary: (summary: ArcaSettingsSummary) => void;
  setLastTestResult: (result: ArcaConnectionTestResult | null) => void;
  setLastDiagnostic: (diagnostic: ArcaErrorDiagnostic | null) => void;
  clearManualSecretInputs: () => void;
}) {
  const cert = params.values.cert?.trim();
  const key = params.values.key?.trim();

  if (!(params.hasConfiguredCredentials || (cert && key))) {
    const message =
      "Debés cargar un certificado y una clave privada para guardar la configuración manual.";
    params.form.setError("cert", {
      type: "manual",
      message,
    });
    params.form.setError("key", {
      type: "manual",
      message,
    });
    toast.error(message);
    return;
  }

  const result = await saveArcaSettingsAction({
    orgSlug: params.orgSlug,
    environment: params.values.environment,
    pointOfSale: params.values.pointOfSale,
    invoiceAAuthorizationType: params.values.invoiceAAuthorizationType,
    cert: cert ? params.values.cert : undefined,
    key: key ? params.values.key : undefined,
    issuerLogoDataUrl: params.values.issuerLogoDataUrl ?? null,
    issuerLegalAddress: params.values.issuerLegalAddress ?? null,
  });

  if (!result.success) {
    if (result.summary) {
      params.syncSummary(result.summary);
    }

    params.setLastDiagnostic(result.diagnostic ?? null);
    toast.error(result.error);
    return;
  }

  params.syncSummary(result.data);
  params.setLastTestResult(null);
  params.setLastDiagnostic(null);
  params.clearManualSecretInputs();
  toast.success("Configuración ARCA guardada correctamente.");
}

async function handleDelegatedOnboardingRequest(params: {
  values: FormValues;
  summary: ArcaSettingsSummary;
  orgSlug: string;
  syncSummary: (summary: ArcaSettingsSummary) => void;
  setLastTestResult: (result: ArcaConnectionTestResult | null) => void;
  setLastDiagnostic: (diagnostic: ArcaErrorDiagnostic | null) => void;
  clearDelegatedCredentialInputs: () => void;
  clearManualSecretInputs: () => void;
}) {
  const payload = {
    orgSlug: params.orgSlug,
    environment: params.values.environment,
    representedCuit:
      params.summary.organizationCuit ?? params.values.representedCuit ?? "",
    login: params.values.login ?? "",
    password: params.values.password ?? "",
    pointOfSale: params.values.pointOfSale,
    invoiceAAuthorizationType: params.values.invoiceAAuthorizationType,
    salesPointProfile: params.values.salesPointProfile,
    issuerLogoDataUrl: params.values.issuerLogoDataUrl ?? null,
    issuerLegalAddress: params.values.issuerLegalAddress ?? null,
  };
  const request = completeDelegatedArcaOnboardingAction(payload);

  params.clearDelegatedCredentialInputs();

  const result = await request;

  if (!result.success) {
    if (result.summary) {
      params.syncSummary(result.summary);
    }

    params.setLastDiagnostic(result.diagnostic ?? null);
    toast.error(result.error);
    return;
  }

  params.syncSummary(result.data.summary);
  params.setLastTestResult(result.data.connectionTest);
  params.setLastDiagnostic(null);
  params.clearManualSecretInputs();
  toast.success(result.data.message);
}

async function handleConnectionTestRequest(params: {
  orgSlug: string;
  syncSummary: (summary: ArcaSettingsSummary) => void;
  setLastTestResult: (result: ArcaConnectionTestResult | null) => void;
  setLastDiagnostic: (diagnostic: ArcaErrorDiagnostic | null) => void;
}) {
  const result = await testArcaConnectionAction(params.orgSlug);

  if (!result.success) {
    if (result.summary) {
      params.syncSummary(result.summary);
    }

    params.setLastDiagnostic(result.diagnostic ?? null);
    toast.error(result.error);
    return;
  }

  params.syncSummary(result.data.summary);
  params.setLastTestResult(result.data);
  params.setLastDiagnostic(null);
  toast.success(result.data.message);
}

function CuitWarningNotice() {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex gap-3">
        <WarningCircleIcon
          className="mt-0.5 size-5 text-amber-600"
          weight="duotone"
        />
        <div className="space-y-1">
          <p className="font-medium text-sm">
            La organización no tiene CUIT configurado
          </p>
          <p className="text-muted-foreground text-sm">
            El onboarding delegado queda deshabilitado hasta que exista un CUIT
            válido en la organización. Mientras tanto, podés conservar el flujo
            manual de certificado y clave.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepHeader({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <p className="font-medium text-primary text-xs uppercase tracking-[0.18em]">
        {step}
      </p>
      <div className="space-y-1">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}

function PemField({
  control,
  fieldName,
  fileInputRef,
  hasConfiguredCredentials,
  label,
  placeholder,
  uploadLabel,
  accept,
  onLoadFile,
}: PemFieldProps) {
  const emptyDescription =
    fieldName === "cert"
      ? "Pegá o subí el certificado en formato PEM."
      : "Pegá o subí la clave privada en formato PEM.";
  const configuredDescription =
    fieldName === "cert"
      ? "Si lo dejás vacío, se mantiene el certificado ya guardado."
      : "Si la dejás vacía, se mantiene la clave privada ya guardada.";

  return (
    <FormField
      control={control}
      name={fieldName}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center justify-between gap-3">
            <FormLabel>{label}</FormLabel>
            <Button
              className="shrink-0"
              onClick={() => fileInputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              <UploadSimpleIcon className="size-4" />
              Subir archivo
            </Button>
          </div>
          <FormControl>
            <Textarea placeholder={placeholder} rows={8} {...field} />
          </FormControl>
          <input
            accept={accept}
            className="hidden"
            onChange={(event) => onLoadFile(event, fieldName, uploadLabel)}
            ref={fileInputRef}
            type="file"
          />
          <FormDescription>
            {hasConfiguredCredentials
              ? configuredDescription
              : emptyDescription}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ArcaSummaryCard({ summary }: { summary: ArcaSettingsSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Estado actual</CardTitle>
        <CardDescription>
          Resumen visible de la configuración ARCA guardada para esta
          organización.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-sm">Estado</span>
            <Badge variant={getStatusBadgeVariant(summary.status)}>
              {getStatusLabel(summary.status, summary.isConfigured)}
            </Badge>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-sm">Modo</span>
            <span className="font-medium">{getModeLabel(summary)}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-sm">
              Operador listo
            </span>
            <span className="font-medium">
              {summary.operatorReady ? "Sí" : "Pendiente admin"}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-sm">Ambiente</span>
            <span className="font-medium">
              {getEnvironmentLabel(summary.environment)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-sm">
              Punto de venta
            </span>
            <span className="font-medium">{summary.pointOfSale ?? "-"}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-sm">
              Factura A habilitada
            </span>
            <span className="max-w-[240px] text-right font-medium">
              {getInvoiceAAuthorizationTypeLabel(
                summary.invoiceAAuthorizationType
              )}
            </span>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <IdentificationCardIcon
              className="mt-0.5 size-5 text-muted-foreground"
              weight="duotone"
            />
            <div>
              <p className="text-muted-foreground text-sm">CUIT emisor</p>
              <p className="font-medium font-mono">
                {summary.organizationCuit ?? "No configurado"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <IdentificationCardIcon
              className="mt-0.5 size-5 text-muted-foreground"
              weight="duotone"
            />
            <div>
              <p className="text-muted-foreground text-sm">CUIT operador</p>
              <p className="font-medium font-mono">
                {summary.operatorCuit ?? "No configurado"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CalendarIcon
              className="mt-0.5 size-5 text-muted-foreground"
              weight="duotone"
            />
            <div>
              <p className="text-muted-foreground text-sm">
                Último test ejecutado
              </p>
              <p className="font-medium">
                {formatDateTime(summary.lastTestedAt)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CalendarIcon
              className="mt-0.5 size-5 text-muted-foreground"
              weight="duotone"
            />
            <div>
              <p className="text-muted-foreground text-sm">
                Vencimiento del certificado activo
              </p>
              <p className="font-medium">
                {formatDateTime(summary.certExpiresAt)}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <UploadSimpleIcon
              className="mt-0.5 size-5 text-muted-foreground"
              weight="duotone"
            />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-sm">Logo del emisor</p>
              {summary.issuerLogoDataUrl ? (
                <div className="mt-2 rounded-lg border bg-background p-3">
                  <Image
                    alt="Logo configurado para la factura"
                    className="h-14 max-w-full object-contain"
                    height={56}
                    src={summary.issuerLogoDataUrl}
                    unoptimized
                    width={240}
                  />
                </div>
              ) : (
                <p className="font-medium">No configurado</p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <IdentificationCardIcon
              className="mt-0.5 size-5 text-muted-foreground"
              weight="duotone"
            />
            <div>
              <p className="text-muted-foreground text-sm">
                Domicilio comercial
              </p>
              <p className="font-medium">
                {summary.issuerLegalAddress ?? "No configurado"}
              </p>
            </div>
          </div>
        </div>

        {summary.lastError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="mb-1 font-medium text-sm">Último error</p>
            <p className="text-sm">{summary.lastError}</p>
          </div>
        )}

        {summary.operatorWsfeLastError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="mb-1 font-medium text-sm">Estado del operador</p>
            <p className="text-sm">{summary.operatorWsfeLastError}</p>
          </div>
        )}

        {!summary.hasCredentials && (
          <div className="rounded-lg border border-dashed p-4">
            <p className="font-medium text-sm">
              Todavía no hay credenciales ARCA disponibles.
            </p>
            <p className="text-muted-foreground text-sm">
              Podés conectar ARCA delegando WSFE al operador o conservar el
              flujo manual cargando certificado y clave en formato PEM.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DelegationTimelineCard({ summary }: { summary: ArcaSettingsSummary }) {
  const delegation = summary.delegation;

  if (!delegation) {
    return null;
  }

  const items = [
    {
      label: "Operador listo",
      done: summary.operatorReady,
      detail: summary.operatorReady
        ? `WSFE autorizado: ${formatDateTime(summary.operatorWsfeAuthorizedAt)}`
        : "Falta autorizar WSFE para el operador global.",
    },
    {
      label: "Delegación creada",
      done:
        delegation.status === "delegated" ||
        delegation.status === "accepted" ||
        delegation.status === "connected",
      detail: formatDateTime(delegation.requestedAt),
    },
    {
      label: "Delegación aceptada",
      done:
        delegation.status === "accepted" || delegation.status === "connected",
      detail: formatDateTime(delegation.acceptedAt),
    },
    {
      label: "Punto de venta validado",
      done:
        delegation.lastSuccessfulStep === "validate_sales_point" ||
        delegation.lastSuccessfulStep === "test_wsfe" ||
        delegation.lastSuccessfulStep === "connected",
      detail: `Punto ${delegation.pointOfSale ?? "-"} / ${getSalesPointProfileLabel(
        delegation.salesPointProfile ?? "existing_wsfe_point"
      )}`,
    },
    {
      label: "Conexión WSFE validada",
      done: delegation.status === "connected",
      detail: formatDateTime(delegation.connectedAt),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Timeline de delegación</CardTitle>
        <CardDescription>
          Estado persistido del onboarding delegado para este tenant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div
            className="flex items-start justify-between gap-3 rounded-lg border p-3"
            key={item.label}
          >
            <div>
              <p className="font-medium text-sm">{item.label}</p>
              <p className="text-muted-foreground text-sm">{item.detail}</p>
            </div>
            <Badge variant={item.done ? "default" : "outline"}>
              {item.done ? "OK" : "Pendiente"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ArcaDiagnosticCard({
  diagnostic,
}: {
  diagnostic: ArcaErrorDiagnostic;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Diagnóstico técnico</CardTitle>
        <CardDescription>
          Pista adicional del último intento, sin exponer credenciales.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Código</span>
          <span className="font-medium">
            {getDiagnosticCodeLabel(diagnostic.code)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Clave técnica</span>
          <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
            {diagnostic.code}
          </code>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Paso</span>
          <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
            {diagnostic.step ?? "-"}
          </code>
        </div>
        {diagnostic.hint ? (
          <div className="rounded-lg border p-3">
            <p className="font-medium text-sm">Qué significa</p>
            <p className="mt-1 text-muted-foreground text-sm">
              {diagnostic.hint}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function LastConnectionTestCard({
  result,
}: {
  result: ArcaConnectionTestResult;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Último test ejecutado</CardTitle>
        <CardDescription>{result.message}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">Fecha</span>
          <span>{formatDateTime(result.testedAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">
            Tipos de comprobante devueltos
          </span>
          <span>{result.voucherTypesCount ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">
            Puntos de venta reportados por WSFE
          </span>
          <span>{result.salesPointsCount ?? "-"}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground">
            Punto de venta configurado validado
          </span>
          <span>
            {getPointOfSaleValidationLabel(result.pointOfSaleValidated)}
          </span>
        </div>
        {result.serverStatus && (
          <div className="rounded-lg border p-3">
            <p className="mb-2 font-medium text-sm">
              Estado reportado por WSFE
            </p>
            <div className="space-y-1 text-muted-foreground text-sm">
              <p>AppServer: {result.serverStatus.AppServer ?? "-"}</p>
              <p>DbServer: {result.serverStatus.DbServer ?? "-"}</p>
              <p>AuthServer: {result.serverStatus.AuthServer ?? "-"}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DelegatedSecurityNotice() {
  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex gap-3">
        <WarningCircleIcon
          className="mt-0.5 size-5 text-amber-600"
          weight="duotone"
        />
        <div className="space-y-1">
          <p className="font-medium text-sm">
            Las credenciales del cliente se usan una sola vez y no se guardan
          </p>
          <p className="text-muted-foreground text-sm">
            Rhino usa estos datos sólo para delegar WSFE al operador y validar
            el punto de venta. Si necesitás reintentar, tendrás que volver a
            ingresarlos.
          </p>
        </div>
      </div>
    </div>
  );
}

function DelegatedGuideCard({
  environment,
  profile,
}: {
  environment: FormValues["environment"];
  profile: AutomaticSalesPointProfile;
}) {
  const environmentLabel = environment === "prod" ? "Producción" : "Desarrollo";
  const environmentText =
    environment === "prod"
      ? "La plataforma delega WSFE al operador, acepta la delegación, valida el punto de venta y prueba la conexión real."
      : "La plataforma delega WSFE al operador, acepta la delegación, valida el punto de venta y prueba la conexión en homologación.";

  return (
    <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
      <div>
        <p className="font-medium text-sm">Instructivo para delegación</p>
        <p className="text-muted-foreground text-sm">
          Perfil seleccionado: {getSalesPointProfileLabel(profile)}.
        </p>
      </div>
      <div className="space-y-2 text-sm">
        <p>
          <span className="font-medium">{environmentLabel}.</span> Ingresá CUIT
          de acceso, contraseña ARCA y punto de venta.
        </p>
        <p className="text-muted-foreground">{environmentText}</p>
        <p className="text-muted-foreground">
          Si algo falla, mostramos el error sanitizado. El modo manual queda
          disponible como respaldo.
        </p>
      </div>
    </div>
  );
}

function IssuerLogoField({
  form,
  logoFileInputRef,
  onLoadLogoFile,
  onClearLogoFile,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  logoFileInputRef: RefObject<HTMLInputElement | null>;
  onLoadLogoFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearLogoFile: () => void;
}) {
  return (
    <FormField
      control={form.control}
      name="issuerLogoDataUrl"
      render={({ field }) => (
        <FormItem>
          <StepHeader
            description="Se imprime en la factura fiscal y aplica tanto al modo delegado como al manual."
            step="Paso común"
            title="Logo del emisor"
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <FormLabel>Logo para la factura</FormLabel>
              <FormDescription>
                Conviene usar una imagen horizontal con fondo transparente.
              </FormDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                className="shrink-0"
                onClick={() => logoFileInputRef.current?.click()}
                size="sm"
                type="button"
                variant="outline"
              >
                <UploadSimpleIcon className="size-4" />
                Subir logo
              </Button>
              {field.value ? (
                <Button
                  onClick={onClearLogoFile}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Quitar logo
                </Button>
              ) : null}
            </div>
          </div>
          <FormControl>
            <input
              onChange={field.onChange}
              type="hidden"
              value={field.value ?? ""}
            />
          </FormControl>
          <div className="rounded-xl border border-dashed bg-muted/20 p-4">
            {field.value ? (
              <div className="flex min-h-28 items-center justify-center rounded-lg bg-background p-4">
                <Image
                  alt="Preview del logo de factura"
                  className="max-h-20 max-w-full object-contain"
                  height={80}
                  src={field.value}
                  unoptimized
                  width={320}
                />
              </div>
            ) : (
              <div className="flex min-h-28 items-center justify-center rounded-lg border border-muted-foreground/30 border-dashed px-4 text-center">
                <p className="text-muted-foreground text-sm">
                  Todavía no hay un logo cargado para la factura.
                </p>
              </div>
            )}
          </div>
          <input
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onLoadLogoFile}
            ref={logoFileInputRef}
            type="file"
          />
          <FormDescription>
            Formatos permitidos: {ACCEPTED_LOGO_FILE_LABEL}. Tamaño máximo:{" "}
            {formatFileSize(MAX_LOGO_FILE_SIZE_BYTES)}.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function IssuerLegalAddressField({
  form,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
}) {
  return (
    <FormField
      control={form.control}
      name="issuerLegalAddress"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Domicilio comercial</FormLabel>
          <FormControl>
            <Input
              placeholder="Ej: Mendoza 1678, CABA"
              {...field}
              value={field.value ?? ""}
            />
          </FormControl>
          <FormDescription>
            Se imprime en el encabezado de la factura fiscal. Si lo dejás vacío,
            se mostrará como no informado.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function DelegatedSetupFields({
  form,
  organizationCuit,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  organizationCuit: string | null;
}) {
  const environment = form.watch("environment");
  const salesPointProfile = form.watch("salesPointProfile");

  return (
    <div className="space-y-6">
      <StepHeader
        description="Completá los datos temporales que el servidor usará para delegar WSFE al operador multitenant."
        step="Paso 3"
        title="Delegación multitenant"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="invoiceAAuthorizationType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Habilitación Factura A</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná la habilitación" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="standard">A estándar</SelectItem>
                  <SelectItem value="operation_subject_to_withholding">
                    A con leyenda operación sujeta a retención
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Si el emisor no tiene A estándar, Rhino usará esta definición
                para emitir el código WSFE correcto.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="representedCuit"
          render={() => (
            <FormItem>
              <FormLabel>CUIT representado</FormLabel>
              <FormControl>
                <Input
                  disabled
                  placeholder="30-12345678-9"
                  readOnly
                  value={organizationCuit ?? ""}
                />
              </FormControl>
              <FormDescription>
                Se toma automáticamente desde la organización y no se puede
                editar.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="login"
          render={({ field }) => (
            <FormItem>
              <FormLabel>CUIT o usuario de acceso</FormLabel>
              <FormControl>
                <Input placeholder="CUIT o usuario ARCA" {...field} />
              </FormControl>
              <FormDescription>
                Se usa sólo durante esta request para ejecutar la delegación.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contraseña ARCA</FormLabel>
              <FormControl>
                <PasswordInput
                  autoComplete="new-password"
                  placeholder="Ingresá la contraseña"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Nunca se persiste ni se devuelve al cliente.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="pointOfSale"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Punto de venta</FormLabel>
              <FormControl>
                <Input
                  min={1}
                  onChange={(event) =>
                    field.onChange(Number(event.target.value) || 0)
                  }
                  type="number"
                  value={field.value}
                />
              </FormControl>
              <FormDescription>
                El servidor lo crea o valida según el perfil elegido.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="salesPointProfile"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Perfil del punto de venta</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccioná un perfil" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="monotributo_wsfe">
                    Monotributo WSFE
                  </SelectItem>
                  <SelectItem value="existing_wsfe_point">
                    Punto WSFE existente
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Monotributo permite crear automáticamente el punto de venta. El
                perfil existente exige que ya esté habilitado.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <DelegatedSecurityNotice />
      <DelegatedGuideCard
        environment={environment}
        profile={salesPointProfile}
      />

      <div className="rounded-xl border border-dashed p-4">
        <p className="font-medium text-sm">Fallback manual siempre visible</p>
        <p className="text-muted-foreground text-sm">
          Si la delegación falla, podés cambiar a la pestaña{" "}
          <span className="font-medium">Manual</span> y conservar el flujo PEM.
        </p>
      </div>
    </div>
  );
}

function ManualSetupFields({
  form,
  certFileInputRef,
  keyFileInputRef,
  hasConfiguredCredentials,
  onLoadPemFile,
}: {
  form: ReturnType<typeof useForm<FormValues>>;
  certFileInputRef: RefObject<HTMLInputElement | null>;
  keyFileInputRef: RefObject<HTMLInputElement | null>;
  hasConfiguredCredentials: boolean;
  onLoadPemFile: (
    event: ChangeEvent<HTMLInputElement>,
    field: "cert" | "key",
    label: string
  ) => void;
}) {
  return (
    <div className="space-y-6">
      <StepHeader
        description="Conserva el flujo actual para organizaciones que ya tienen PEM o quieren cargarlo manualmente."
        step="Paso 3"
        title="Carga manual de certificado y clave"
      />

      <FormField
        control={form.control}
        name="invoiceAAuthorizationType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Habilitación Factura A</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná la habilitación" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="standard">A estándar</SelectItem>
                <SelectItem value="operation_subject_to_withholding">
                  A con leyenda operación sujeta a retención
                </SelectItem>
              </SelectContent>
            </Select>
            <FormDescription>
              Rhino usa esta definición para decidir si una Factura A debe ir
              con `CbteTipo` 1 o 51.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="pointOfSale"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Punto de venta</FormLabel>
            <FormControl>
              <Input
                min={1}
                onChange={(event) =>
                  field.onChange(Number(event.target.value) || 0)
                }
                type="number"
                value={field.value}
              />
            </FormControl>
            <FormDescription>Debe ser un entero positivo.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <PemField
        accept=".pem,.crt,.cer,text/plain,application/x-pem-file"
        control={form.control}
        fieldName="cert"
        fileInputRef={certFileInputRef}
        hasConfiguredCredentials={hasConfiguredCredentials}
        label="Certificado PEM"
        onLoadFile={onLoadPemFile}
        placeholder={`-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----`}
        uploadLabel="Certificado"
      />

      <PemField
        accept=".pem,.key,text/plain,application/x-pem-file"
        control={form.control}
        fieldName="key"
        fileInputRef={keyFileInputRef}
        hasConfiguredCredentials={hasConfiguredCredentials}
        label="Clave privada PEM"
        onLoadFile={onLoadPemFile}
        placeholder={`-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----`}
        uploadLabel="Clave privada"
      />

      <div className="rounded-xl border border-dashed p-4">
        <p className="font-medium text-sm">Fallback manual</p>
        <p className="text-muted-foreground text-sm">
          Si ya tenés el certificado y la clave, este flujo sigue disponible y
          no depende del operador multitenant.
        </p>
      </div>
    </div>
  );
}

function ArcaFormActions({
  mode,
  isBusy,
  isSavingManual,
  isDelegating,
  isTesting,
  canRunDelegated,
  canTest,
  onTestConnection,
}: {
  mode: FormValues["mode"];
  isBusy: boolean;
  isSavingManual: boolean;
  isDelegating: boolean;
  isTesting: boolean;
  canRunDelegated: boolean;
  canTest: boolean;
  onTestConnection: () => void;
}) {
  const primarySubmitLabel = getPrimarySubmitLabel({
    isSavingManual,
    isDelegating,
    mode,
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        disabled={isBusy || (mode === "delegated" && !canRunDelegated)}
        type="submit"
      >
        {isSavingManual ? (
          <>
            <Spinner />
            Guardando...
          </>
        ) : null}
        {isDelegating ? (
          <>
            <Spinner />
            Delegando...
          </>
        ) : null}
        {primarySubmitLabel}
      </Button>

      <Button
        disabled={!canTest}
        onClick={onTestConnection}
        type="button"
        variant="outline"
      >
        {isTesting ? (
          <>
            <Spinner />
            Probando conexión...
          </>
        ) : (
          "Probar conexión"
        )}
      </Button>
    </div>
  );
}

function OnboardingModeHelp({
  mode,
  hasOrganizationCuit,
  operatorReady,
}: {
  mode: FormValues["mode"];
  hasOrganizationCuit: boolean;
  operatorReady: boolean;
}) {
  if (mode === "manual") {
    return (
      <p className="text-muted-foreground text-sm">
        La prueba usa únicamente la configuración ya guardada.
      </p>
    );
  }

  return (
    <div className="space-y-1 text-sm">
      <p className="text-muted-foreground">
        El servidor usa las credenciales del cliente una sola vez, delega WSFE
        al operador y deja el estado final como conectado o error.
      </p>
      {operatorReady ? null : (
        <p className="text-amber-700">
          Falta que Rhinos autorice WSFE para el operador global desde
          `/admin/arca`.
        </p>
      )}
      {hasOrganizationCuit ? null : (
        <p className="text-amber-700">
          Configurá primero el CUIT de la organización para habilitar la
          delegación.
        </p>
      )}
    </div>
  );
}

export function ArcaSettingsForm({
  orgSlug,
  initialSummary,
}: ArcaSettingsFormProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [lastTestResult, setLastTestResult] =
    useState<ArcaConnectionTestResult | null>(null);
  const [lastDiagnostic, setLastDiagnostic] =
    useState<ArcaErrorDiagnostic | null>(null);
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [isDelegating, setIsDelegating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const certFileInputRef = useRef<HTMLInputElement | null>(null);
  const keyFileInputRef = useRef<HTMLInputElement | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaultValues(summary),
  });

  const mode = form.watch("mode");
  const selectedEnvironment = form.watch("environment");
  const hasConfiguredManualCredentials =
    summary.mode === "manual" && summary.hasCredentials && summary.isConfigured;
  const isBusy = isSavingManual || isDelegating || isTesting;
  const selectedOperatorReady =
    summary.operatorReadyByEnvironment[selectedEnvironment];
  const canTest =
    summary.isConfigured &&
    summary.hasCredentials &&
    Boolean(summary.organizationCuit) &&
    !isBusy;
  const canRunDelegated =
    Boolean(summary.organizationCuit) && selectedOperatorReady && !isBusy;
  const syncSummary = (nextSummary: ArcaSettingsSummary) =>
    syncSummaryState({
      form,
      nextSummary,
      setSummary,
    });
  const clearStoredManualSecrets = () =>
    clearManualSecretInputs({
      form,
      certFileInputRef,
      keyFileInputRef,
    });
  const clearDelegatedCredentials = () => clearDelegatedCredentialInputs(form);
  const loadPemFile = (
    event: ChangeEvent<HTMLInputElement>,
    field: "cert" | "key",
    label: string
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";
      form.setValue(field, content, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      toast.success(`${label} cargado correctamente.`);
    };

    reader.onerror = () => {
      toast.error(`No se pudo leer el archivo de ${label.toLowerCase()}.`);
    };

    reader.readAsText(file);
  };
  const loadLogoFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!ACCEPTED_LOGO_TYPES.has(file.type)) {
      toast.error(`El logo debe estar en formato ${ACCEPTED_LOGO_FILE_LABEL}.`);
      event.target.value = "";
      return;
    }

    if (file.size > MAX_LOGO_FILE_SIZE_BYTES) {
      toast.error(
        `El logo supera el máximo permitido de ${formatFileSize(
          MAX_LOGO_FILE_SIZE_BYTES
        )}.`
      );
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : "";

      form.setValue("issuerLogoDataUrl", content || null, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      toast.success("Logo cargado. Guarda la configuración para aplicarlo.");
    };

    reader.onerror = () => {
      toast.error("No se pudo leer el archivo del logo.");
      event.target.value = "";
    };

    reader.readAsDataURL(file);
  };
  const clearLogoFile = () => {
    form.setValue("issuerLogoDataUrl", null, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });

    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = "";
    }
  };
  const handleSubmit = async (values: FormValues) => {
    if (values.mode === "delegated") {
      setIsDelegating(true);
      setLastDiagnostic(null);

      try {
        await handleDelegatedOnboardingRequest({
          values,
          summary,
          orgSlug,
          syncSummary,
          setLastTestResult,
          setLastDiagnostic,
          clearDelegatedCredentialInputs: clearDelegatedCredentials,
          clearManualSecretInputs: clearStoredManualSecrets,
        });
      } finally {
        clearDelegatedCredentials();
        setIsDelegating(false);
      }

      return;
    }

    setIsSavingManual(true);
    setLastDiagnostic(null);

    try {
      await handleManualSaveRequest({
        values,
        hasConfiguredCredentials: hasConfiguredManualCredentials,
        form,
        orgSlug,
        syncSummary,
        setLastTestResult,
        setLastDiagnostic,
        clearManualSecretInputs: clearStoredManualSecrets,
      });
    } finally {
      setIsSavingManual(false);
    }
  };
  const handleTestConnection = async () => {
    setIsTesting(true);
    setLastDiagnostic(null);

    try {
      await handleConnectionTestRequest({
        orgSlug,
        syncSummary,
        setLastTestResult,
        setLastDiagnostic,
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {!summary.organizationCuit && <CuitWarningNotice />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LightningIcon className="size-5 text-primary" weight="duotone" />
              Configuración ARCA
            </CardTitle>
            <CardDescription>
              Elegí delegación multitenant o carga manual. Las credenciales del
              cliente viven sólo durante la request; el operador usa un
              certificado global administrado por la plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                className="space-y-6"
                onSubmit={form.handleSubmit(handleSubmit)}
              >
                <div className="space-y-4 rounded-xl border p-4">
                  <StepHeader
                    description="Elegí el ambiente fiscal que vas a configurar."
                    step="Paso 1"
                    title="Ambiente"
                  />
                  <FormField
                    control={form.control}
                    name="environment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ambiente ARCA</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccioná un ambiente" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="dev">Desarrollo</SelectItem>
                            <SelectItem value="prod">Producción</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Este valor se guarda y se reutiliza para la emisión
                          fiscal posterior.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4 rounded-xl border p-4">
                  <StepHeader
                    description="Podés delegar WSFE al operador o cargar PEM manualmente."
                    step="Paso 2"
                    title="Modo de onboarding"
                  />

                  <FormField
                    control={form.control}
                    name="mode"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Tabs
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="delegated">
                                Delegado
                              </TabsTrigger>
                              <TabsTrigger value="manual">Manual</TabsTrigger>
                            </TabsList>

                            <div className="mt-6">
                              <div className="space-y-5">
                                <IssuerLogoField
                                  form={form}
                                  logoFileInputRef={logoFileInputRef}
                                  onClearLogoFile={clearLogoFile}
                                  onLoadLogoFile={loadLogoFile}
                                />
                                <IssuerLegalAddressField form={form} />
                              </div>
                            </div>

                            <TabsContent className="mt-6" value="delegated">
                              <DelegatedSetupFields
                                form={form}
                                organizationCuit={summary.organizationCuit}
                              />
                            </TabsContent>

                            <TabsContent className="mt-6" value="manual">
                              <ManualSetupFields
                                certFileInputRef={certFileInputRef}
                                form={form}
                                hasConfiguredCredentials={
                                  hasConfiguredManualCredentials
                                }
                                keyFileInputRef={keyFileInputRef}
                                onLoadPemFile={loadPemFile}
                              />
                            </TabsContent>
                          </Tabs>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <ArcaFormActions
                  canRunDelegated={canRunDelegated}
                  canTest={canTest}
                  isBusy={isBusy}
                  isDelegating={isDelegating}
                  isSavingManual={isSavingManual}
                  isTesting={isTesting}
                  mode={mode}
                  onTestConnection={handleTestConnection}
                />

                <OnboardingModeHelp
                  hasOrganizationCuit={Boolean(summary.organizationCuit)}
                  mode={mode}
                  operatorReady={selectedOperatorReady}
                />
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <ArcaSummaryCard
            summary={{
              ...summary,
              environment: summary.environment ?? selectedEnvironment,
              operatorReady: selectedOperatorReady,
            }}
          />
          <DelegationTimelineCard summary={summary} />
          {lastDiagnostic ? (
            <ArcaDiagnosticCard diagnostic={lastDiagnostic} />
          ) : null}
          {lastTestResult && <LastConnectionTestCard result={lastTestResult} />}
        </div>
      </div>
    </div>
  );
}
