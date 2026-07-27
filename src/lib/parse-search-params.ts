import type { SortParam } from "@/types/pagination";

export type SearchParamsInput = {
  page?: string;
  perPage?: string;
  sort?: string;
  search?: string;
};

export type ParsedSearchParams = {
  page: number;
  pageSize: number;
  search: string | undefined;
  sort: SortParam[] | undefined;
};

export function parseSearchParams(
  sp: SearchParamsInput,
  defaultPageSize = 10
): ParsedSearchParams {
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Math.min(
    50,
    Math.max(1, Number(sp.perPage) || defaultPageSize)
  );
  const search = sp.search || undefined;

  let sort: SortParam[] | undefined;
  if (sp.sort) {
    try {
      sort = JSON.parse(sp.sort);
    } catch {
      sort = undefined;
    }
  }

  return { page, pageSize, search, sort };
}

export function parseDateRangeFilter(
  raw: string | undefined
): { from?: string; to?: string } | undefined {
  if (!raw) {
    return;
  }

  const [fromStr, toStr] = raw.split(",");
  const fromMs = Number(fromStr);
  const toMs = toStr ? Number(toStr) : Number.NaN;

  const from =
    !Number.isNaN(fromMs) && fromStr
      ? new Date(fromMs).toISOString()
      : undefined;
  let to =
    !Number.isNaN(toMs) && toStr ? new Date(toMs).toISOString() : undefined;

  if (from && to && fromMs === toMs) {
    to = new Date(fromMs + 86_399_999).toISOString();
  }

  if (from || to) {
    return { from, to };
  }

  return;
}
