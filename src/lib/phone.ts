export function formatPhoneForWhatsApp(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, "");

  if (!digitsOnly.startsWith("54") && digitsOnly.length >= 10) {
    return `54${digitsOnly}`;
  }

  return digitsOnly;
}
