import type Afip from "@afipsdk/afip.js";
import type { Database, Json } from "@/types/supabase";

export type ArcaEnvironment = "dev" | "prod";
export type ArcaConnectionStatus = "pending" | "connected" | "error";
export type ArcaClientActor = "current-user" | "system";

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
  serverStatus?: ArcaConnectionServerStatus;
  summary: ArcaSettingsSummary;
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
