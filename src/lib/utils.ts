import { type ClassValue, clsx } from "clsx";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) {
    return "-";
  }
  try {
    const date = new Date(dateString);
    return format(date, "dd MMM yyyy, HH:mm", { locale: es });
  } catch {
    return "-";
  }
}
