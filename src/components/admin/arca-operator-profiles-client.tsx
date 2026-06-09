"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarIcon,
  IdentificationCardIcon,
  LightningIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { type ChangeEvent, useRef, useState } from "react";
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
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";
import { authorizeArcaOperatorWsfeAction } from "@/modules/arca/actions/authorize-arca-operator-wsfe.action";
import { saveArcaOperatorProfileAction } from "@/modules/arca/actions/save-arca-operator-profile.action";
import { testArcaOperatorProfileAction } from "@/modules/arca/actions/test-arca-operator-profile.action";
import type {
  ArcaConnectionStatus,
  ArcaEnvironment,
  ArcaOperatorAuthorizationResult,
  ArcaOperatorProfileSummary,
  ArcaOperatorProfilesByEnvironment,
  ArcaOperatorProfileTestResult,
} from "@/modules/arca/types";

const ARCA_CERT_ALIAS_REGEX = /^[A-Za-z0-9]+$/;
const PEM_REGEX = /-----BEGIN [^-]+-----[\s\S]+-----END [^-]+-----/;

function validateOperatorProfileFields(
  value: OperatorProfileFormValues,
  ctx: z.RefinementCtx
) {
  const cert = value.cert?.trim();
  const key = value.key?.trim();
  const login = value.login?.trim();
  const password = value.password?.trim();

  validateOperatorCredentialPair({ login, password, ctx });
  validateOperatorPemPair({ cert, key, ctx });
}

function validateOperatorCredentialPair(params: {
  login?: string;
  password?: string;
  ctx: z.RefinementCtx;
}) {
  if (
    (params.login && !params.password) ||
    (!params.login && params.password)
  ) {
    params.ctx.addIssue({
      code: "custom",
      message:
        "Si cambiás credenciales, debés informar usuario y contraseña juntos.",
      path: params.login ? ["password"] : ["login"],
    });
  }
}

function validateOperatorPemPair(params: {
  cert?: string;
  key?: string;
  ctx: z.RefinementCtx;
}) {
  if (params.cert && !PEM_REGEX.test(params.cert)) {
    params.ctx.addIssue({
      code: "custom",
      message: "El certificado debe estar en formato PEM válido.",
      path: ["cert"],
    });
  }

  if (params.key && !PEM_REGEX.test(params.key)) {
    params.ctx.addIssue({
      code: "custom",
      message: "La clave debe estar en formato PEM válido.",
      path: ["key"],
    });
  }

  if ((params.cert && !params.key) || (!params.cert && params.key)) {
    params.ctx.addIssue({
      code: "custom",
      message: "Si cambiás el PEM, debés cargar certificado y clave juntos.",
      path: params.cert ? ["key"] : ["cert"],
    });
  }
}

const operatorProfileSchema = z
  .object({
    operatorCuit: z.string().min(1, "El CUIT operador es obligatorio."),
    certAlias: z
      .string()
      .trim()
      .min(1, "El alias del certificado es obligatorio.")
      .regex(
        ARCA_CERT_ALIAS_REGEX,
        "El alias debe ser alfanumérico, sin espacios ni guiones."
      ),
    login: z.string().optional(),
    password: z.string().optional(),
    cert: z.string().optional(),
    key: z.string().optional(),
  })
  .superRefine(validateOperatorProfileFields);

type OperatorProfileFormValues = z.infer<typeof operatorProfileSchema>;

function getStatusBadgeVariant(
  status: ArcaConnectionStatus | null
): "default" | "secondary" | "destructive" | "outline" {
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

  return "Pendiente";
}

function buildDefaultValues(
  summary: ArcaOperatorProfileSummary
): OperatorProfileFormValues {
  return {
    operatorCuit: summary.operatorCuit ?? "",
    certAlias: summary.certAlias ?? "",
    login: "",
    password: "",
    cert: "",
    key: "",
  };
}

function PemInput({
  label,
  fieldName,
  placeholder,
  form,
  fileInputRef,
  onLoadFile,
}: {
  label: string;
  fieldName: "cert" | "key";
  placeholder: string;
  form: ReturnType<typeof useForm<OperatorProfileFormValues>>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onLoadFile: (
    event: ChangeEvent<HTMLInputElement>,
    field: "cert" | "key",
    label: string
  ) => void;
}) {
  return (
    <FormField
      control={form.control}
      name={fieldName}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center justify-between gap-3">
            <FormLabel>{label}</FormLabel>
            <Button
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
            <Textarea placeholder={placeholder} rows={7} {...field} />
          </FormControl>
          <input
            className="hidden"
            onChange={(event) => onLoadFile(event, fieldName, label)}
            ref={fileInputRef}
            type="file"
          />
          <FormDescription>
            Si lo dejás vacío, se conserva el PEM actual.
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function OperatorProfileCard({
  environment,
  initialSummary,
  onSummaryChange,
}: {
  environment: ArcaEnvironment;
  initialSummary: ArcaOperatorProfileSummary;
  onSummaryChange: (
    environment: ArcaEnvironment,
    summary: ArcaOperatorProfileSummary
  ) => void;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [lastTest, setLastTest] =
    useState<ArcaOperatorProfileTestResult | null>(null);
  const [lastAuthorization, setLastAuthorization] =
    useState<ArcaOperatorAuthorizationResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const certFileInputRef = useRef<HTMLInputElement | null>(null);
  const keyFileInputRef = useRef<HTMLInputElement | null>(null);
  const form = useForm<OperatorProfileFormValues>({
    resolver: zodResolver(operatorProfileSchema),
    defaultValues: buildDefaultValues(summary),
  });

  const syncSummary = (nextSummary: ArcaOperatorProfileSummary) => {
    setSummary(nextSummary);
    onSummaryChange(environment, nextSummary);
    form.setValue("operatorCuit", nextSummary.operatorCuit ?? "");
    form.setValue("certAlias", nextSummary.certAlias ?? "");
  };

  const clearSecretInputs = () => {
    form.setValue("login", "");
    form.setValue("password", "");
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

  const handleSave = async (values: OperatorProfileFormValues) => {
    setIsSaving(true);

    try {
      const result = await saveArcaOperatorProfileAction({
        environment,
        operatorCuit: values.operatorCuit,
        certAlias: values.certAlias,
        login: values.login?.trim() ? values.login : undefined,
        password: values.password?.trim() ? values.password : undefined,
        cert: values.cert?.trim() ? values.cert : undefined,
        key: values.key?.trim() ? values.key : undefined,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      syncSummary(result.data);
      clearSecretInputs();
      toast.success(
        `Perfil operador ${environment === "prod" ? "de producción" : "de desarrollo"} guardado.`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);

    try {
      const result = await testArcaOperatorProfileAction(environment);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setLastTest(result.data);
      syncSummary(result.data.summary);
      toast.success(result.data.message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleAuthorizeWsfe = async () => {
    setIsAuthorizing(true);

    try {
      const result = await authorizeArcaOperatorWsfeAction(environment);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setLastAuthorization(result.data);
      syncSummary(result.data.summary);
      toast.success(result.data.message);
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>
              Operador {environment === "prod" ? "Producción" : "Desarrollo"}
            </CardTitle>
            <CardDescription>
              Certificado global y credenciales ARCA del CUIT operador para el
              ambiente {environment}.
            </CardDescription>
          </div>
          <Badge variant={getStatusBadgeVariant(summary.status)}>
            {getStatusLabel(summary.status, summary.isConfigured)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4">
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
          </div>
          <div className="rounded-lg border p-4">
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
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <LightningIcon
                className="mt-0.5 size-5 text-muted-foreground"
                weight="duotone"
              />
              <div>
                <p className="text-muted-foreground text-sm">WSFE autorizado</p>
                <p className="font-medium">
                  {summary.isWsfeAuthorized
                    ? formatDateTime(summary.wsfeAuthorizedAt)
                    : "Pendiente"}
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <CalendarIcon
                className="mt-0.5 size-5 text-muted-foreground"
                weight="duotone"
              />
              <div>
                <p className="text-muted-foreground text-sm">
                  Última verificación WSFE
                </p>
                <p className="font-medium">
                  {formatDateTime(summary.wsfeLastCheckedAt)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {summary.lastError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="mb-1 font-medium text-sm">Último error</p>
            <p className="text-sm">{summary.lastError}</p>
          </div>
        ) : null}

        {summary.wsfeLastError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="mb-1 font-medium text-sm">Último error WSFE</p>
            <p className="text-sm">{summary.wsfeLastError}</p>
          </div>
        ) : null}

        <div className="rounded-lg border bg-muted/20 p-4 text-sm">
          <p className="font-medium">Checklist operativo</p>
          <p className="mt-2 text-muted-foreground">
            1. Cargá CUIT, alias, credenciales y PEM del operador.
          </p>
          <p className="text-muted-foreground">
            2. Ejecutá "Autorizar WSFE" una vez por ambiente.
          </p>
          <p className="text-muted-foreground">
            3. Ejecutá "Probar perfil" y dejalo en conectado.
          </p>
        </div>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(handleSave)}>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="operatorCuit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CUIT operador</FormLabel>
                    <FormControl>
                      <Input placeholder="20-12345678-9" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="certAlias"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Alias del certificado</FormLabel>
                    <FormControl>
                      <Input placeholder="rhinoprod" {...field} />
                    </FormControl>
                    <FormDescription>
                      Lo usa AFIP SDK al autorizar WSFE del operador.
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
                    <FormLabel>Usuario o CUIT de acceso</FormLabel>
                    <FormControl>
                      <Input placeholder="usuario ARCA" {...field} />
                    </FormControl>
                    <FormDescription>
                      Si lo dejás vacío, se conserva el actual.
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
                        placeholder="Contraseña del operador"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Si la dejás vacía, se conserva la actual.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <PemInput
              fieldName="cert"
              fileInputRef={certFileInputRef}
              form={form}
              label="Certificado PEM"
              onLoadFile={loadPemFile}
              placeholder={`-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----`}
            />

            <PemInput
              fieldName="key"
              fileInputRef={keyFileInputRef}
              form={form}
              label="Clave privada PEM"
              onLoadFile={loadPemFile}
              placeholder={`-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----`}
            />

            <div className="flex flex-wrap gap-3">
              <Button disabled={isSaving} type="submit">
                {isSaving ? (
                  <>
                    <Spinner />
                    Guardando...
                  </>
                ) : (
                  "Guardar perfil"
                )}
              </Button>
              <Button
                disabled={isAuthorizing || isTesting || isSaving}
                onClick={handleAuthorizeWsfe}
                type="button"
                variant="secondary"
              >
                {isAuthorizing ? (
                  <>
                    <Spinner />
                    Autorizando...
                  </>
                ) : (
                  "Autorizar WSFE"
                )}
              </Button>
              <Button
                disabled={isAuthorizing || isTesting || isSaving}
                onClick={handleTest}
                type="button"
                variant="outline"
              >
                {isTesting ? (
                  <>
                    <Spinner />
                    Probando...
                  </>
                ) : (
                  "Probar perfil"
                )}
              </Button>
            </div>
          </form>
        </Form>

        {lastTest ? (
          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium">{lastTest.message}</p>
            <p className="mt-2 text-muted-foreground">
              Último test: {formatDateTime(lastTest.testedAt)}
            </p>
            <p className="text-muted-foreground">
              Tipos de comprobante: {lastTest.voucherTypesCount ?? "-"}
            </p>
          </div>
        ) : null}

        {lastAuthorization ? (
          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium">{lastAuthorization.message}</p>
            <p className="mt-2 text-muted-foreground">
              Última autorización/verificación:{" "}
              {formatDateTime(lastAuthorization.checkedAt)}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ArcaOperatorProfilesClient({
  initialProfiles,
}: {
  initialProfiles: ArcaOperatorProfilesByEnvironment;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);

  const updateSummary = (
    environment: ArcaEnvironment,
    summary: ArcaOperatorProfileSummary
  ) => {
    setProfiles((current) => ({
      ...current,
      [environment]: summary,
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Operador ARCA</h1>
        <p className="text-muted-foreground text-sm">
          Administrá el CUIT operador global que acepta delegaciones WSFE y
          firma la conexión multitenant de Rhino.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <OperatorProfileCard
          environment="dev"
          initialSummary={profiles.dev}
          onSummaryChange={updateSummary}
        />
        <OperatorProfileCard
          environment="prod"
          initialSummary={profiles.prod}
          onSummaryChange={updateSummary}
        />
      </div>
    </div>
  );
}
