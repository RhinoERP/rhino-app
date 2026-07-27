export type QueryBuilder = {
  eq(column: string, value: unknown): QueryBuilder;
  gte(column: string, value: string): QueryBuilder;
  lte(column: string, value: string): QueryBuilder;
  ilike(column: string, value: string): QueryBuilder;
  or(filter: string): QueryBuilder;
  order(column: string, opts: { ascending?: boolean }): QueryBuilder;
  range(from: number, to: number): QueryBuilder;
  neq(column: string, value: unknown): QueryBuilder;
  in(column: string, values: unknown[]): QueryBuilder;
};
