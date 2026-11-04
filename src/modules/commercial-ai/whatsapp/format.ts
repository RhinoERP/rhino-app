/**
 * Asistente del vendedor por WhatsApp · partes puras (sin base ni red).
 *
 * Normaliza teléfonos, reconoce los atajos ("hoy", "ruta", "pendientes") y
 * arma los textos que se mandan por WhatsApp. Se testea sin servicios.
 */
import { OPEN_STAGES } from "../constants";
import { formatMoneyShort, niceName } from "../engine/analysis";
import type { CommercialAiSnapshot } from "../types";

const NON_DIGITS = /\D/g;
const PHONE_KEY_LENGTH = 10;
const AR_LOCAL_LENGTH = 10;
const MIN_PHONE = 8;
const MAX_PHONE = 15;
const LINK = /\[\[(?:cli|opp|pro):[^|\]]+\|([^\]]+)\]\]/g;
const BOLD = /\*\*(.+?)\*\*/g;
const HEADING = /^#{1,6}\s+/gm;
const BULLET = /^\s*[-*]\s+/gm;
const ACCENTS = /[̀-ͯ]/g;
const PUNCTUATION = /[¿?¡!.,;:]/g;
const SPACES = /\s+/g;
const TOP_ITEMS = 3;
const PCT = 100;

/**
 * Deja solo dígitos con código de país. Un número argentino cargado como
 * "11 2345-6789" queda 5491123456789 (el formato que manda Meta).
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(NON_DIGITS, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.length === AR_LOCAL_LENGTH) {
    digits = `549${digits}`;
  } else if (digits.startsWith("54") && !digits.startsWith("549")) {
    digits = `549${digits.slice(2)}`;
  }
  if (digits.length < MIN_PHONE || digits.length > MAX_PHONE) {
    return null;
  }
  return digits;
}

const AR_MOBILE_PREFIX = "549";
const AR_MOBILE_LENGTH = 13;

/**
 * Número al que se le responde. Meta manda los celulares argentinos como
 * 549 + área + número, pero para escribirles la API espera 54 + área + número
 * (sin el 9); si no, rechaza el envío (o el número no figura entre los
 * destinatarios de prueba).
 */
export function whatsappRecipient(phone: string): string {
  const digits = phone.replace(NON_DIGITS, "");
  return digits.startsWith(AR_MOBILE_PREFIX) &&
    digits.length === AR_MOBILE_LENGTH
    ? `54${digits.slice(AR_MOBILE_PREFIX.length)}`
    : digits;
}

/** Últimos 10 dígitos: coincide aunque cambie el prefijo del país o el 9. */
export function phoneKey(phone: string): string {
  return phone.replace(NON_DIGITS, "").slice(-PHONE_KEY_LENGTH);
}

/** Pasa el formato de la app (links, **negrita**, viñetas) al de WhatsApp. */
export function toWhatsAppText(markdown: string): string {
  return markdown
    .replace(LINK, "$1")
    .replace(BOLD, "*$1*")
    .replace(HEADING, "")
    .replace(BULLET, "• ")
    .trim();
}

export type QuickCommand = "dia" | "ruta" | "pendientes" | "ayuda";

const COMMANDS: Record<string, QuickCommand> = {
  hoy: "dia",
  dia: "dia",
  "mi dia": "dia",
  "ver mi dia": "dia",
  resumen: "dia",
  "que tengo hoy": "dia",
  ruta: "ruta",
  "mi ruta": "ruta",
  "ruta de hoy": "ruta",
  pendientes: "pendientes",
  tareas: "pendientes",
  recordatorios: "pendientes",
  ayuda: "ayuda",
  menu: "ayuda",
  hola: "ayuda",
};

/** Reconoce los atajos; cualquier otra cosa va al asistente con IA. */
export function parseQuickCommand(text: string): QuickCommand | null {
  const key = text
    .normalize("NFD")
    .replace(ACCENTS, "")
    .replace(PUNCTUATION, "")
    .replace(SPACES, " ")
    .trim()
    .toLowerCase();
  return COMMANDS[key] ?? null;
}

export function helpText(name: string): string {
  return [
    `Hola ${name}, soy tu asistente comercial de Rhinos.`,
    "",
    "Escribime:",
    "• *hoy* · tu día: ruta, a quién llamar y pendientes",
    "• *ruta* · las paradas de hoy",
    "• *pendientes* · lo que prometiste hacer",
    "",
    "O contame en tus palabras, escrito o por audio 🎧, por ejemplo:",
    "• _Pasé por Lácteos Catamarca, pidieron 20 kg de muzza_",
    "• _Cargá 5 cremosos y 10 kg de muzza para El Obrero_ (te muestro el total y lo cargo cuando me digas *sí*)",
    "• _Recordame llamar a El Obrero el jueves_",
    "• _¿Cuánto me compró Morini este año?_",
  ].join("\n");
}

function firstName(snapshot: CommercialAiSnapshot): string {
  return niceName(snapshot.currentUserName.split(" ")[0] ?? "");
}

function routeLines(snapshot: CommercialAiSnapshot): string[] {
  const route = snapshot.prospecting.routes.find(
    (r) => r.date === snapshot.today && r.sellerId === snapshot.currentUserId
  );
  if (!route || route.stops.length === 0) {
    return [];
  }
  return route.stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(
      (stop) =>
        `${stop.result ? "✅" : `${stop.position}.`} ${niceName(stop.name)}${stop.city ? ` (${niceName(stop.city)})` : ""}${stop.reason ? ` · ${stop.reason}` : ""}`
    );
}

function pendingLines(snapshot: CommercialAiSnapshot): string[] {
  const names = new Map(snapshot.customers.map((c) => [c.id, c.name]));
  return snapshot.tasks
    .filter(
      (t) =>
        !t.doneAt &&
        t.dueDate <= snapshot.today &&
        (t.sellerId === null || t.sellerId === snapshot.currentUserId)
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map((t) => {
      const late = t.dueDate < snapshot.today ? " (atrasado)" : "";
      return `• ${niceName(names.get(t.customerId) ?? "Cliente")}: ${t.body}${late}`;
    });
}

export function routeText(snapshot: CommercialAiSnapshot): string {
  const lines = routeLines(snapshot);
  return lines.length
    ? [`*Tu ruta de hoy* (${lines.length} paradas)`, ...lines].join("\n")
    : "Hoy no tenés ruta armada. Pedile al gerente que la arme o escribime *hoy* para ver a quién llamar.";
}

export function pendingText(snapshot: CommercialAiSnapshot): string {
  const lines = pendingLines(snapshot);
  return lines.length
    ? [`*Pendientes* (${lines.length})`, ...lines].join("\n")
    : "No tenés pendientes para hoy. 👌";
}

/** El resumen del día: meta, ruta, a quién llamar, pendientes y deuda. */
export function dayDigest(snapshot: CommercialAiSnapshot): string {
  const parts: string[] = [`Buen día ${firstName(snapshot)} 👋`];

  const mine = snapshot.plan.sellers.find(
    (s) => s.sellerId === snapshot.currentUserId
  );
  if (mine && mine.target > 0) {
    const pct = Math.round((mine.real / mine.target) * PCT);
    const monthPct = Math.round(
      (snapshot.plan.dayOfMonth / snapshot.plan.daysInMonth) * PCT
    );
    parts.push(
      `*Meta del mes:* ${formatMoneyShort(mine.real)} de ${formatMoneyShort(mine.target)} (${pct} % con el ${monthPct} % del mes).`
    );
  }

  const route = routeLines(snapshot);
  if (route.length) {
    parts.push([`*Ruta de hoy* (${route.length})`, ...route].join("\n"));
  }

  const open = snapshot.opportunities
    .filter(
      (o) =>
        OPEN_STAGES.includes(o.effectiveStage) &&
        o.sellerId === snapshot.currentUserId
    )
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_ITEMS);
  if (open.length) {
    parts.push(
      [
        "*A quién llamar*",
        ...open.map(
          (o) =>
            `• ${niceName(o.customerName)} · ~${formatMoneyShort(o.value)}/mes · ${o.evidenceShort}`
        ),
      ].join("\n")
    );
  }

  const pending = pendingLines(snapshot);
  if (pending.length) {
    parts.push([`*Pendientes* (${pending.length})`, ...pending].join("\n"));
  }

  const debtors = snapshot.customers
    .filter((c) => c.overdue > 0 && c.sellerId === snapshot.currentUserId)
    .sort((a, b) => b.overdue - a.overdue)
    .slice(0, TOP_ITEMS);
  if (debtors.length) {
    parts.push(
      [
        "*Para cobrar*",
        ...debtors.map(
          (c) =>
            `• ${niceName(c.name)} · ${formatMoneyShort(c.overdue)} vencido (${c.maxDaysLate} días)`
        ),
      ].join("\n")
    );
  }

  if (parts.length === 1) {
    parts.push(
      "Hoy no tenés nada urgente. ¿Querés que veamos a quién ofrecerle algo?"
    );
  }
  parts.push(
    "Contame cómo te fue en cada visita y lo anoto. Escribime *ayuda* para ver qué más puedo hacer."
  );
  return parts.join("\n\n");
}
