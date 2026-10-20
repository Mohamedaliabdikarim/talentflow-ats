/**
 * Minimal chainable fake of the Supabase query builder for unit tests. Each `from()` call
 * records one query (table, operation, values, filters); the test's resolver decides what it
 * returns. `maybeSingle()` and `await` both resolve through the resolver, so list-shaped and
 * single-row queries can share one fake. No network, no real client.
 */

export type FakeFilter = { method: string; column: string; value: unknown };

export type FakeQuery = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  values?: unknown;
  filters: FakeFilter[];
  selected?: string;
};

export type FakeResult = { data: unknown; error: { code?: string; message: string } | null };

export type FakeResolver = (query: FakeQuery) => FakeResult | Promise<FakeResult>;

export type FakeDownload = (
  bucket: string,
  key: string,
) => Promise<{
  data: { arrayBuffer: () => Promise<ArrayBuffer> } | null;
  error: { message: string } | null;
}>;

export function findFilter(
  query: FakeQuery,
  column: string,
  method = "eq",
): FakeFilter | undefined {
  return query.filters.find((filter) => filter.column === column && filter.method === method);
}

export function createFakeSupabase(
  resolve: FakeResolver,
  options: { download?: FakeDownload } = {},
) {
  const queries: FakeQuery[] = [];

  function from(table: string) {
    const query: FakeQuery = { table, op: "select", filters: [] };
    queries.push(query);
    const chain: Record<string, unknown> = {};
    const filter = (method: string) => (column: string, value?: unknown) => {
      query.filters.push({ method, column, value });
      return chain;
    };
    for (const method of ["eq", "neq", "in", "lt", "gt", "ilike"]) chain[method] = filter(method);
    chain.select = (columns?: string) => {
      query.selected = columns;
      return chain;
    };
    chain.order = () => chain;
    chain.limit = () => chain;
    chain.insert = (values: unknown) => {
      query.op = "insert";
      query.values = values;
      return chain;
    };
    chain.update = (values: unknown) => {
      query.op = "update";
      query.values = values;
      return chain;
    };
    chain.delete = () => {
      query.op = "delete";
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve(resolve(query));
    chain.then = (
      onFulfilled: (value: FakeResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolve(query)).then(onFulfilled, onRejected);
    return chain;
  }

  const client = {
    from,
    storage: {
      from: (bucket: string) => ({
        download: (key: string) =>
          options.download
            ? options.download(bucket, key)
            : Promise.resolve({ data: null, error: { message: "no storage in this fake" } }),
      }),
    },
  };

  return { client, queries };
}
