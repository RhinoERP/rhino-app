"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarIcon,
  IdentificationCardIcon,
  LightningIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import { saveArcaSettingsAction } from "@/modules/arca/actions/save-arca-settings.action";
import { testArcaConnectionAction } from "@/modules/arca/actions/test-arca-connection.action";
import type {
  ArcaConnectionStatus,
  ArcaConnectionTestResult,
  ArcaSettingsSummary,
} from "@/modules/arca/types";

const PEM_REGEX = /-----BEGIN [^-]+-----[\s\S]+-----END [^-]+-----/;

const formSchema = z
  .object({
    environment: z.enum(["dev", "prod"]),
    pointOfSale: z
      .number()
      .int("El punto de venta debe ser un entero.")
      .positive("El punto de venta debe ser mayor a 0."),
    cert: z.string().optional(),
    key: z.string().optional(),
  })
  .superRefine((value, ctx) => {
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
  });

type FormValues = z.infer<typeof formSchema>;
type StatusBadgeVariant = "default" | "secondary" | "destructive" | "outline";

type ArcaSettingsFormProps = {
  orgSlug: string;
  initialSummary: ArcaSettingsSummary;
};

type PemFieldProps = {
  control: ReturnType<typeof useForm<FormValues>>["control"];
  fieldName: "cert" | "key";
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  hasConfiguredCredentials: boolean;
  label: string;
  placeholder: string;
  uploadLabel: string;
  accept: string;
  onLoadFile: (
    event: React.ChangeEvent<HTMLInputElement>,
    field: "cert" | "key",
    label: string
  ) => void;
};

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
            Podés guardar el certificado, la clave y el punto de venta, pero la
            prueba de conexión va a quedar deshabilitada hasta que exista un
            CUIT válido en la organización.
          </p>
        </div>
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
          Resumen visible de la configuración ARCA de esta organización.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">Estado</span>
          <Badge variant={getStatusBadgeVariant(summary.status)}>
            {getStatusLabel(summary.status, summary.isConfigured)}
          </Badge>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm">Ambiente</p>
            <p className="font-medium">
              {getEnvironmentLabel(summary.environment)}
            </p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-muted-foreground text-sm">Punto de venta</p>
            <p className="font-medium">{summary.pointOfSale ?? "-"}</p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <IdentificationCardIcon
              className="mt-0.5 size-5 text-muted-foreground"
              weight="duotone"
            />
            <div>
              <p className="text-muted-foreground text-sm">CUIT</p>
              <p className="font-medium font-mono">
                {summary.organizationCuit ?? "No configurado"}
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
                Vencimiento del certificado
              </p>
              <p className="font-medium">
                {formatDateTime(summary.certExpiresAt)}
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

        {!summary.hasCredentials && (
          <div className="rounded-lg border border-dashed p-4">
            <p className="font-medium text-sm">
              Todavía no hay credenciales guardadas.
            </p>
            <p className="text-muted-foreground text-sm">
              Guardá certificado, clave, ambiente y punto de venta para
              habilitar la prueba server-side.
            </p>
          </div>
        )}
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

export function ArcaSettingsForm({
  orgSlug,
  initialSummary,
}: ArcaSettingsFormProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [lastTestResult, setLastTestResult] =
    useState<ArcaConnectionTestResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const certFileInputRef = useRef<HTMLInputElement | null>(null);
  const keyFileInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      environment: summary.environment ?? "dev",
      pointOfSale: summary.pointOfSale ?? 1,
      cert: "",
      key: "",
    },
  });

  const hasConfiguredCredentials =
    summary.hasCredentials && summary.isConfigured;
  const canTest =
    hasConfiguredCredentials &&
    Boolean(summary.organizationCuit) &&
    !isSaving &&
    !isTesting;

  const syncSummary = (nextSummary: ArcaSettingsSummary) => {
    setSummary(nextSummary);
    form.setValue("environment", nextSummary.environment ?? "dev");
    form.setValue("pointOfSale", nextSummary.pointOfSale ?? 1);
  };

  const clearSecretInputs = () => {
    form.setValue("cert", "");
    form.setValue("key", "");

    if (certFileInputRef.current) {
      certFileInputRef.current.value = "";
    }

    if (keyFileInputRef.current) {
      keyFileInputRef.current.value = "";
    }
  };

  const loadPemFile = (
    event: React.ChangeEvent<HTMLInputElement>,
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

  const handleSave = async (values: FormValues) => {
    setIsSaving(true);

    try {
      const result = await saveArcaSettingsAction({
        orgSlug,
        environment: values.environment,
        pointOfSale: values.pointOfSale,
        cert: values.cert?.trim() ? values.cert : undefined,
        key: values.key?.trim() ? values.key : undefined,
      });

      if (!result.success) {
        if (result.summary) {
          syncSummary(result.summary);
        }

        toast.error(result.error);
        return;
      }

      syncSummary(result.data);
      setLastTestResult(null);
      clearSecretInputs();
      toast.success("Configuración ARCA guardada correctamente.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);

    try {
      const result = await testArcaConnectionAction(orgSlug);

      if (!result.success) {
        if (result.summary) {
          syncSummary(result.summary);
        }

        toast.error(result.error);
        return;
      }

      syncSummary(result.data.summary);
      setLastTestResult(result.data);
      toast.success(result.data.message);
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
              Guardá el certificado y la clave de esta organización en forma
              cifrada. Después de guardar, los secretos no vuelven a mostrarse
              en pantalla.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                className="space-y-6"
                onSubmit={form.handleSubmit(handleSave)}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="environment"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ambiente</FormLabel>
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
                          Elegí el ambiente ARCA específico de esta
                          organización.
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
                          Debe ser un entero positivo.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <PemField
                  accept=".pem,.crt,.cer,text/plain,application/x-pem-file"
                  control={form.control}
                  fieldName="cert"
                  fileInputRef={certFileInputRef}
                  hasConfiguredCredentials={hasConfiguredCredentials}
                  label="Certificado PEM"
                  onLoadFile={loadPemFile}
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
                  onLoadFile={loadPemFile}
                  placeholder={`-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----`}
                  uploadLabel="Clave privada"
                />

                <div className="flex flex-wrap items-center gap-3">
                  <Button disabled={isSaving || isTesting} type="submit">
                    {isSaving ? (
                      <>
                        <Spinner />
                        Guardando...
                      </>
                    ) : (
                      "Guardar configuración"
                    )}
                  </Button>
                  <Button
                    disabled={!canTest}
                    onClick={handleTestConnection}
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
                  <p className="text-muted-foreground text-sm">
                    La prueba usa únicamente la configuración ya guardada.
                  </p>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <ArcaSummaryCard summary={summary} />
          {lastTestResult && <LastConnectionTestCard result={lastTestResult} />}
        </div>
      </div>
    </div>
  );
}
