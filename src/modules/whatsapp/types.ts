export const WHATSAPP_INTEGRATION_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ERROR",
  "DISCONNECTED",
] as const;

export type WhatsAppIntegrationStatus =
  (typeof WHATSAPP_INTEGRATION_STATUSES)[number];

export type WhatsAppIntegration = {
  id: string;
  organizationId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  status: WhatsAppIntegrationStatus;
  salesPriceListId: string | null;
  responsibleUserId: string | null;
  businessHours: Record<string, unknown>;
  commercialRules: Record<string, unknown>;
  handoffMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppIntegrationConfiguration = Pick<
  WhatsAppIntegration,
  | "phoneNumberId"
  | "displayPhoneNumber"
  | "status"
  | "salesPriceListId"
  | "responsibleUserId"
  | "businessHours"
  | "commercialRules"
  | "handoffMessage"
>;
