import type Afip from "@afipsdk/afip.js";
import type { Database, Json } from "@/types/supabase";

export type ArcaEnvironment = "dev" | "prod";
export type ArcaConnectionStatus = "pending" | "connected" | "error";
export type ArcaClientActor = "current-user" | "system";
export type ArcaDiagnosticCode =
  | "invalid_credentials"
  | "automation_timeout"
  | "create_certificate_failed"
  | "certificate_not_emitted"
  | "authorize_wsfe_failed"
  | "list_sales_points_failed"
  | "unexpected_sales_points_response"
  | "create_sales_point_failed"
  | "sales_point_not_found"
  | "sales_point_incompatible"
  | "sales_point_blocked"
  | "sales_point_deactivated"
  | "represented_cuit_mismatch"
  | "missing_organization_cuit"
  | "invalid_organization_cuit"
  | "unexpected_error";
export type AutomaticSalesPointProfile =
  | "monotributo_wsfe"
  | "existing_wsfe_point";

export type ArcaErrorDiagnostic = {
  code: ArcaDiagnosticCode;
  step?: string | null;
  hint?: string | null;
};

export type OrganizationArcaSettingsRow =
  Database["public"]["Tables"]["organization_arca_settings"]["Row"];

export type ArcaSettingsSummary = {
  environment: ArcaEnvironment | null;
  pointOfSale: number | null;
  status: ArcaConnectionStatus | null;
  lastTestedAt: string | null;
  lastError: string | null;
  certExpiresAt: string | null;
  issuerLogoDataUrl: string | null;
  hasCredentials: boolean;
  isConfigured: boolean;
  organizationCuit: string | null;
};

export type SaveArcaSettingsInput = {
  orgSlug: string;
  environment: ArcaEnvironment;
  pointOfSale: number;
  cert?: string;
  key?: string;
  issuerLogoDataUrl?: string | null;
};

export type AutomaticArcaOnboardingInput = {
  orgSlug: string;
  environment: ArcaEnvironment;
  representedCuit: string;
  login: string;
  password: string;
  certAlias: string;
  pointOfSale: number;
  salesPointProfile: AutomaticSalesPointProfile;
  issuerLogoDataUrl?: string | null;
};

export type ArcaConnectionServerStatus = {
  AppServer?: string;
  DbServer?: string;
  AuthServer?: string;
};

export type ArcaConnectionTestResult = {
  testedAt: string;
  status: ArcaConnectionStatus;
  message: string;
  voucherTypesCount?: number;
  salesPointsCount?: number;
  pointOfSaleValidated?: boolean;
  serverStatus?: ArcaConnectionServerStatus;
  summary: ArcaSettingsSummary;
};

export type AutomaticArcaOnboardingResult = {
  status: ArcaConnectionStatus;
  message: string;
  salesPointStatus: "existing" | "created";
  summary: ArcaSettingsSummary;
  connectionTest: ArcaConnectionTestResult;
};

export type ArcaActionResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
      summary?: ArcaSettingsSummary;
      diagnostic?: ArcaErrorDiagnostic;
    };

export type ArcaClient = Afip;

export type ArcaSaleInvoiceStatus =
  | "not_requested"
  | "pending"
  | "authorized"
  | "error";

export type ArcaSaleInvoiceReadiness = ArcaSettingsSummary & {
  canManageSettings: boolean;
  isActive: boolean;
};

export type ArcaSaleInvoiceResult = {
  saleId: string;
  status: ArcaSaleInvoiceStatus;
  invoiceNumber: string | null;
  cae: string | null;
  caeExpiresAt: string | null;
  authorizedAt: string | null;
  pointOfSale: number | null;
  voucherNumber: number | null;
  voucherTypeCode: number | null;
  lastError: string | null;
  requestJson: Json | null;
  responseJson: Json | null;
  idempotent: boolean;
};

export type ArcaSaleInvoiceValidationResult =
  | {
      kind: "ready";
      saleId: string;
      organizationId: string;
      orgSlug: string;
    }
  | {
      kind: "already_authorized";
      result: ArcaSaleInvoiceResult;
    };
