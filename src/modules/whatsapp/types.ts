export const WHATSAPP_INTEGRATION_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ERROR",
  "DISCONNECTED",
] as const;

export type WhatsAppIntegrationStatus =
  (typeof WHATSAPP_INTEGRATION_STATUSES)[number];

export const WHATSAPP_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type WhatsAppWeekday = (typeof WHATSAPP_WEEKDAYS)[number];

export type WhatsAppBusinessHoursDay = {
  enabled: boolean;
  start: string;
  end: string;
};

export type WhatsAppBusinessHours = {
  enabled: boolean;
  timezone: string;
  weeklySchedule: Record<WhatsAppWeekday, WhatsAppBusinessHoursDay>;
};

export const DEFAULT_WHATSAPP_BUSINESS_HOURS: WhatsAppBusinessHours = {
  enabled: false,
  timezone: "America/Argentina/Buenos_Aires",
  weeklySchedule: {
    monday: { enabled: true, start: "09:00", end: "18:00" },
    tuesday: { enabled: true, start: "09:00", end: "18:00" },
    wednesday: { enabled: true, start: "09:00", end: "18:00" },
    thursday: { enabled: true, start: "09:00", end: "18:00" },
    friday: { enabled: true, start: "09:00", end: "18:00" },
    saturday: { enabled: false, start: "09:00", end: "13:00" },
    sunday: { enabled: false, start: "09:00", end: "13:00" },
  },
};

export const DEFAULT_WHATSAPP_RESPONSE_DELAY = {
  minMinutes: 1,
  maxMinutes: 3,
} as const;

export type WhatsAppIntegration = {
  id: string;
  organizationId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  status: WhatsAppIntegrationStatus;
  salesPriceListId: string | null;
  responsibleUserId: string | null;
  businessHours: WhatsAppBusinessHours;
  responseDelayMinMinutes: number;
  responseDelayMaxMinutes: number;
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
  | "responseDelayMinMinutes"
  | "responseDelayMaxMinutes"
  | "commercialRules"
  | "handoffMessage"
>;
