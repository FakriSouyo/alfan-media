export type Filter = { column: string; op: string; value: unknown };
export interface QuerySpec {
  table: string; action: "select" | "insert" | "update" | "delete" | "upsert";
  columns: string; values?: Record<string, unknown> | Record<string, unknown>[];
  filters: Filter[]; orders: { column: string; ascending: boolean }[];
  offset?: number; limit?: number; single?: "one" | "maybe";
  count?: boolean; head?: boolean; returning?: boolean; onConflict?: string;
}
export interface QueryResult { data: unknown; error: { message: string; code?: string } | null; count?: number | null; }
export type Execute = (query: QuerySpec) => Promise<QueryResult>;

export class Query implements PromiseLike<QueryResult> {
  private spec: QuerySpec;
  constructor(table: string, private execute: Execute) { this.spec = { table, action: "select", columns: "*", filters: [], orders: [] }; }
  select(columns = "*", options?: { count?: string; head?: boolean }) { this.spec.columns = columns; this.spec.returning = true; this.spec.count = !!options?.count; this.spec.head = options?.head; return this; }
  insert(values: QuerySpec["values"]) { this.spec.action = "insert"; this.spec.values = values; return this; }
  update(values: Record<string, unknown>) { this.spec.action = "update"; this.spec.values = values; return this; }
  upsert(values: QuerySpec["values"], options?: { onConflict?: string }) { this.spec.action = "upsert"; this.spec.values = values; this.spec.onConflict = options?.onConflict; return this; }
  delete() { this.spec.action = "delete"; return this; }
  private filter(column: string, op: string, value: unknown) { this.spec.filters.push({ column, op, value }); return this; }
  eq(column: string, value: unknown) { return this.filter(column,"eq",value); }
  neq(column: string, value: unknown) { return this.filter(column,"neq",value); }
  gt(column: string, value: unknown) { return this.filter(column,"gt",value); }
  gte(column: string, value: unknown) { return this.filter(column,"gte",value); }
  lt(column: string, value: unknown) { return this.filter(column,"lt",value); }
  lte(column: string, value: unknown) { return this.filter(column,"lte",value); }
  in(column: string, value: unknown[]) { return this.filter(column,"in",value); }
  is(column: string, value: null | boolean) { return this.filter(column,"is",value); }
  ilike(column: string, value: string) { return this.filter(column,"ilike",value); }
  or(value: string) { return this.filter("", "or", value); }
  order(column: string, options?: { ascending?: boolean }) { this.spec.orders.push({ column, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.spec.limit = value; return this; }
  range(from: number, to: number) { this.spec.offset = from; this.spec.limit = to-from+1; return this; }
  single() { this.spec.single = "one"; return this; }
  maybeSingle() { this.spec.single = "maybe"; return this; }
  then<TResult1 = QueryResult, TResult2 = never>(resolve?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> { return this.execute(structuredClone(this.spec)).then(resolve,reject); }
}
