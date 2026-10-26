import "server-only";

import type { RawProspect } from "../engine/prospecting";

const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
].join(",");
const PAGE_SIZE = 20;

const COUNTRY_CODES: Record<string, string> = {
  Argentina: "AR",
  Bolivia: "BO",
  Brasil: "BR",
  Chile: "CL",
  Colombia: "CO",
  Ecuador: "EC",
  España: "ES",
  México: "MX",
  Paraguay: "PY",
  Perú: "PE",
  Uruguay: "UY",
};

type PlaceResult = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
};

export function isGooglePlacesEnabled(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

function component(place: PlaceResult, type: string): string | null {
  return (
    place.addressComponents?.find((c) => c.types?.includes(type))?.longText ??
    null
  );
}

/** Busca comercios de un rubro en una zona (Google Places · Text Search). */
export async function searchPlaces(params: {
  keyword: string;
  zone: string;
  country: string;
}): Promise<RawProspect[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Falta GOOGLE_PLACES_API_KEY para buscar en Google Places."
    );
  }
  const response = await fetch(PLACES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: `${params.keyword} en ${params.zone}`,
      languageCode: "es",
      regionCode: COUNTRY_CODES[params.country] ?? "AR",
      pageSize: PAGE_SIZE,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Google Places respondió ${response.status}: ${detail.slice(0, 200)}`
    );
  }
  const data = (await response.json()) as { places?: PlaceResult[] };
  return (data.places ?? [])
    .filter((place) => place.businessStatus !== "CLOSED_PERMANENTLY")
    .map((place) => ({
      name: place.displayName?.text ?? "Comercio",
      category: place.primaryTypeDisplayName?.text ?? null,
      address: place.formattedAddress ?? null,
      city:
        component(place, "locality") ??
        component(place, "administrative_area_level_2"),
      province: component(place, "administrative_area_level_1"),
      phone: place.nationalPhoneNumber ?? null,
      email: null,
      website: place.websiteUri ?? null,
      externalId: `gplaces:${place.id}`,
      source: "google_places" as const,
      rating: place.rating ?? null,
      reviews: place.userRatingCount ?? null,
    }));
}
