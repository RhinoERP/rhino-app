/**
 * Reglas de prospección: leer una lista propia, descartar lo que no sirve,
 * puntuar el encaje con el perfil de cliente ideal y armar un primer mensaje.
 * La IA (si está activa) mejora el puntaje y el mensaje; esto es la base.
 */
import type { CampaignView, IcpView } from "../types";

export type RawProspect = {
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  externalId: string | null;
  source: "lista" | "google_places";
  rating?: number | null;
  reviews?: number | null;
};

export type ScoredProspect = RawProspect & {
  fitScore: number;
  fitReasons: string;
  message: string;
};

const BASE_SCORE = 30;
const KEYWORD_NAME_POINTS = 35;
const KEYWORD_CATEGORY_POINTS = 25;
const CONTACT_POINTS = 10;
const RATING_POINTS = 10;
const GOOD_RATING = 4;
const MIN_REVIEWS = 20;
const MAX_SCORE = 100;

function normalize(text: string | null | undefined): string {
  return (text ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/* ============ Lista propia (CSV pegado o subido) ============ */

const HEADER_ALIASES: Record<
  keyof Omit<RawProspect, "source" | "externalId" | "rating" | "reviews">,
  string[]
> = {
  name: [
    "nombre",
    "razon social",
    "nombre fantasia",
    "comercio",
    "empresa",
    "name",
  ],
  category: ["rubro", "categoria", "tipo", "category"],
  address: ["direccion", "domicilio", "address"],
  city: ["localidad", "ciudad", "barrio", "city"],
  province: ["provincia", "estado", "province"],
  phone: ["telefono", "celular", "whatsapp", "tel", "phone"],
  email: ["email", "mail", "correo"],
  website: ["web", "sitio", "website", "url"],
};

function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Lee un CSV (coma, punto y coma o tab) con encabezados en español o inglés. */
export function parseProspectCsv(text: string): RawProspect[] {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => line.trim() !== "");
  if (lines.length < 2) {
    return [];
  }
  const header = lines[0];
  const separator = [";", "\t", ","].reduce((best, candidate) =>
    header.split(candidate).length > header.split(best).length
      ? candidate
      : best
  );
  const columns = splitCsvLine(header, separator).map(normalize);
  const indexOf = (field: keyof typeof HEADER_ALIASES) =>
    columns.findIndex((column) => HEADER_ALIASES[field].includes(column));
  const index = {
    name: indexOf("name"),
    category: indexOf("category"),
    address: indexOf("address"),
    city: indexOf("city"),
    province: indexOf("province"),
    phone: indexOf("phone"),
    email: indexOf("email"),
    website: indexOf("website"),
  };
  const nameIndex = index.name >= 0 ? index.name : 0;
  const cell = (cells: string[], i: number) =>
    i >= 0 ? cells[i] || null : null;

  return lines
    .slice(1)
    .map((line) => splitCsvLine(line, separator))
    .filter((cells) => cells[nameIndex])
    .map((cells) => ({
      name: cells[nameIndex],
      category: cell(cells, index.category),
      address: cell(cells, index.address),
      city: cell(cells, index.city),
      province: cell(cells, index.province),
      phone: cell(cells, index.phone),
      email: cell(cells, index.email),
      website: cell(cells, index.website),
      externalId: null,
      source: "lista" as const,
    }));
}

/* ============ Filtros ============ */

export function dedupeKey(
  prospect: Pick<RawProspect, "name" | "city">
): string {
  return `${normalize(prospect.name)}|${normalize(prospect.city)}`;
}

/** Saca a los que ya son clientes, ya son prospectos o están en la lista de exclusión. */
export function filterCandidates(
  candidates: RawProspect[],
  params: {
    existingKeys: Set<string>;
    existingExternalIds: Set<string>;
    customerNames: Set<string>;
    exclusions: string[];
  }
): { kept: RawProspect[]; discarded: { name: string; why: string }[] } {
  const exclusions = params.exclusions.map(normalize).filter(Boolean);
  const kept: RawProspect[] = [];
  const discarded: { name: string; why: string }[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = dedupeKey(candidate);
    const name = normalize(candidate.name);
    let why: string | null = null;
    if (seen.has(key)) {
      why = "repetido en la búsqueda";
    } else if (
      params.existingKeys.has(key) ||
      (candidate.externalId &&
        params.existingExternalIds.has(candidate.externalId))
    ) {
      why = "ya es prospecto";
    } else if (params.customerNames.has(name)) {
      why = "ya es cliente";
    } else if (exclusions.some((ex) => name.includes(ex))) {
      why = "está en la lista de exclusión";
    }
    seen.add(key);
    if (why) {
      discarded.push({ name: candidate.name, why });
    } else {
      kept.push(candidate);
    }
  }
  return { kept, discarded };
}

/* ============ Encaje y mensaje por reglas ============ */

export function ruleFitScore(
  prospect: RawProspect,
  icp: IcpView | null
): { score: number; reasons: string } {
  const reasons: string[] = [];
  let score = BASE_SCORE;
  const keywords = (icp?.keywords ?? []).map(normalize).filter(Boolean);
  const name = normalize(prospect.name);
  const category = normalize(prospect.category);
  const byName = keywords.find((k) => name.includes(k));
  const byCategory = keywords.find((k) => category.includes(k));
  if (byName) {
    score += KEYWORD_NAME_POINTS;
    reasons.push(`el nombre indica "${byName}"`);
  }
  if (byCategory && byCategory !== byName) {
    score += KEYWORD_CATEGORY_POINTS;
    reasons.push(`rubro "${prospect.category}"`);
  }
  if (prospect.phone || prospect.email) {
    score += CONTACT_POINTS;
    reasons.push("tiene contacto");
  }
  if (
    (prospect.rating ?? 0) >= GOOD_RATING &&
    (prospect.reviews ?? 0) >= MIN_REVIEWS
  ) {
    score += RATING_POINTS;
    reasons.push(
      `buena reputación (${prospect.rating} con ${prospect.reviews} reseñas)`
    );
  }
  if (!(byName || byCategory) && keywords.length) {
    reasons.push("no se ve claro el rubro del perfil");
  }
  return {
    score: Math.min(MAX_SCORE, score),
    reasons: reasons.join(" · "),
  };
}

const ASK_TEXT: Record<CampaignView["ask"], string> = {
  responder: "¿Te interesa que lo charlemos?",
  diagnostico:
    "¿Te parece si te hago una revisión gratis de lo que estás comprando hoy?",
  reunion: "¿Tenés 15 minutos esta semana para una llamada?",
  visita: "¿Te parece si paso esta semana por el local?",
};

export function templateMessage(params: {
  prospectName: string;
  orgName: string;
  sellerName: string;
  campaign: Pick<CampaignView, "ask" | "entryStrategy" | "catalogUrl">;
  icp: IcpView | null;
}): string {
  const { campaign, icp } = params;
  const pitch =
    icp?.valueProposition ||
    "Somos distribuidores en la zona y entregamos con continuidad y precios estables.";
  const catalog =
    campaign.entryStrategy === "catalogo" && campaign.catalogUrl
      ? ` Te dejo nuestro catálogo: ${campaign.catalogUrl}.`
      : "";
  return `Hola, ¿cómo andás? Soy ${params.sellerName} de ${params.orgName}. Vi ${params.prospectName} y creo que te podemos dar una mano. ${pitch}${catalog} ${ASK_TEXT[campaign.ask]}`;
}

export const ASK_LABELS: Record<CampaignView["ask"], string> = {
  responder: "Que responda si le interesa conversar",
  diagnostico: "Ofrecer un diagnóstico",
  reunion: "Agendar una reunión online",
  visita: "Programar visita",
};
