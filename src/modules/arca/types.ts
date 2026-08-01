import type Afip from "@afipsdk/afip.js";
import type { AnyEvento } from "@/modules/accounting/types";
import type { Database, Json } from "@/types/supabase";

export type ArcaEnvironment = "dev" | "prod";
export type ArcaConnectionStatus = "pending" | "connected" | "error";
export type ArcaConnectionMode = "manual" | "delegated";
export type ArcaClientActor = "current-user" | "system";
export type ArcaInvoiceAAuthorizationType =
  | "standard"
  | "operation_subject_to_withholding";
export type ArcaDelegationStatus =
  | "pending"
  | "delegated"
  | "accepted"
  | "operator_ready"
  | "connected"
  | "error";
export type ArcaDiagnosticCode =
  | "invalid_credentials"
  | "automation_timeout"
  | "certificate_not_emitted"
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
  | "operator_profile_missing"
  | "operator_profile_invalid"
  | "delegate_web_service_failed"
  | "accept_web_service_delegation_failed"
  | "authorize_operator_wsfe_failed"
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
export type ArcaOperatorProfileRow =
  Database["public"]["Tables"]["arca_operator_profiles"]["Row"];
export type OrganizationArcaDelegationRow =
  Database["public"]["Tables"]["organization_arca_delegations"]["Row"];

export type ArcaDelegationStep =
  | "operator_profile_ready"
  | "delegate_web_service"
  | "accept_web_service_delegation"
  | "authorize_delegated_web_service"
  | "validate_sales_point"
  | "test_wsfe"
  | "connected";

export type ArcaDelegationSummary = {
  environment: ArcaEnvironment;
  status: ArcaDelegationStatus;
  representedCuit: string | null;
  operatorCuit: string | null;
  pointOfSale: number | null;
  salesPointProfile: AutomaticSalesPointProfile | null;
  service: string;
  requestedAt: string | null;
  acceptedAt: string | null;
  connectedAt: string | null;
  lastTestedAt: string | null;
  lastError: string | null;
  lastSuccessfulStep: ArcaDelegationStep | null;
  automationTrace: Json | null;
};

export type ArcaSettingsSummary = {
  environment: ArcaEnvironment | null;
  mode: ArcaConnectionMode | null;
  pointOfSale: number | null;
  invoiceAAuthorizationType: ArcaInvoiceAAuthorizationType;
  status: ArcaConnectionStatus | null;
  lastTestedAt: string | null;
  lastError: string | null;
  certExpiresAt: string | null;
  issuerBusinessName: string | null;
  issuerLogoDataUrl: string | null;
  issuerLegalAddress: string | null;
  issuerVatCondition: string | null;
  issuerGrossIncomeNumber: string | null;
  issuerActivityStartDate: string | null;
  hasCredentials: boolean;
  isConfigured: boolean;
  organizationCuit: string | null;
  operatorCuit: string | null;
  usesDelegatedCredentials: boolean;
  operatorReady: boolean;
  operatorReadyByEnvironment: Record<ArcaEnvironment, boolean>;
  operatorWsfeAuthorizedAt: string | null;
  operatorWsfeLastCheckedAt: string | null;
  operatorWsfeLastError: string | null;
  delegation: ArcaDelegationSummary | null;
};

export type ArcaOperatorProfileSummary = {
  id: string | null;
  environment: ArcaEnvironment;
  operatorCuit: string | null;
  certAlias: string | null;
  status: ArcaConnectionStatus | null;
  lastTestedAt: string | null;
  lastError: string | null;
  certExpiresAt: string | null;
  hasCertificate: boolean;
  hasAutomationCredentials: boolean;
  isConfigured: boolean;
  wsfeAuthorizedAt: string | null;
  wsfeLastCheckedAt: string | null;
  wsfeLastError: string | null;
  isWsfeAuthorized: boolean;
};

export type ArcaOperatorProfilesByEnvironment = Record<
  ArcaEnvironment,
  ArcaOperatorProfileSummary
>;

export type SaveArcaSettingsInput = {
  orgSlug: string;
  environment: ArcaEnvironment;
  pointOfSale: number;
  invoiceAAuthorizationType: ArcaInvoiceAAuthorizationType;
  cert?: string;
  key?: string;
  issuerBusinessName?: string | null;
  issuerLogoDataUrl?: string | null;
  issuerLegalAddress?: string | null;
  issuerVatCondition?: string | null;
  issuerGrossIncomeNumber?: string | null;
  issuerActivityStartDate?: string | null;
};

export type SaveArcaOperatorProfileInput = {
  environment: ArcaEnvironment;
  operatorCuit: string;
  login?: string;
  password?: string;
  certAlias: string;
  cert?: string;
  key?: string;
};

export type DelegatedArcaOnboardingInput = {
  orgSlug: string;
  environment: ArcaEnvironment;
  representedCuit: string;
  login: string;
  password: string;
  pointOfSale: number;
  invoiceAAuthorizationType: ArcaInvoiceAAuthorizationType;
  salesPointProfile: AutomaticSalesPointProfile;
  issuerBusinessName?: string | null;
  issuerLogoDataUrl?: string | null;
  issuerLegalAddress?: string | null;
  issuerVatCondition?: string | null;
  issuerGrossIncomeNumber?: string | null;
  issuerActivityStartDate?: string | null;
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

export type ArcaOperatorProfileTestResult = {
  testedAt: string;
  status: ArcaConnectionStatus;
  message: string;
  voucherTypesCount?: number;
  serverStatus?: ArcaConnectionServerStatus;
  summary: ArcaOperatorProfileSummary;
};

export type ArcaOperatorAuthorizationResult = {
  checkedAt: string;
  message: string;
  alreadyAuthorized: boolean;
  summary: ArcaOperatorProfileSummary;
};

export type DelegatedArcaOnboardingResult = {
  status: ArcaConnectionStatus;
  message: string;
  salesPointStatus: "existing" | "created" | "wsfe_validation";
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
  | "pending_invoicing"
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

export type ArcaCreditNoteInvoiceResult = {
  creditNoteId: string;
  status: ArcaSaleInvoiceStatus;
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

export type ArcaDebitNoteInvoiceResult = {
  debitNoteId: string;
  status: "draft" | "pending" | "verifying" | "authorized" | "error";
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
  accountingPayload?: AnyEvento | null;
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

export type ResolvedArcaOrganizationCredentials = {
  mode: ArcaConnectionMode;
  organizationCuit: string;
  environment: ArcaEnvironment;
  pointOfSale: number;
  cert: string;
  key: string;
  certExpiresAt: string | null;
  settings: OrganizationArcaSettingsRow;
  operatorProfile: ArcaOperatorProfileRow | null;
  delegation: OrganizationArcaDelegationRow | null;
};
