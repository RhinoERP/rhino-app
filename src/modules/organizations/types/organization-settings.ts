import { z } from "zod";

/**
 * Schema for organization_settings.settings JSONB column.
 * Add new settings here — never touches the organizations table.
 * Existing settings (remittance_auto_enabled, etc.) remain in organizations.
 */
export const organizationSettingsSchema = z.object({
  remittance_single_page_duplicate: z.boolean().default(false),
});

export type OrganizationSettingsData = z.infer<
  typeof organizationSettingsSchema
>;

export const ORGANIZATION_SETTINGS_DEFAULTS: OrganizationSettingsData = {
  remittance_single_page_duplicate: false,
};
