export const PRIVACY_PATH = "/privacidad";
export const DATA_DELETION_PATH = "/eliminacion-datos";
export const PRIVACY_EMAIL = "comercial@rhinosapp.com";
export const PRIVACY_EMAIL_HREF = `mailto:${PRIVACY_EMAIL}`;
export const DATA_DELETION_EMAIL_HREF = `${PRIVACY_EMAIL_HREF}?subject=${encodeURIComponent("Eliminación de datos personales")}`;

export function isPublicLegalPath(pathname: string): boolean {
  return pathname === PRIVACY_PATH || pathname === DATA_DELETION_PATH;
}
