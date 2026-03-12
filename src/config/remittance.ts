type RemittanceIssuerConfig = {
  legalAddress: string | null;
  logoUrl: string | null;
};

const sanitizeConfigValue = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export const remittanceIssuerConfig: RemittanceIssuerConfig = {
  legalAddress: sanitizeConfigValue(
    process.env.NEXT_PUBLIC_REMITTANCE_LEGAL_ADDRESS
  ),
  logoUrl: sanitizeConfigValue(process.env.NEXT_PUBLIC_REMITTANCE_LOGO_URL),
};
