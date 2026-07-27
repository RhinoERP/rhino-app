export type SortParam = {
  id: string;
  desc: boolean;
};

export type PaginatedResult<T> = {
  data: T[];
  totalCount: number;
  page: number;
  pageSize: number;
};
