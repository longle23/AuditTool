/**
 * Minimal NocoDB v2 REST client. Tables are looked up by title inside NOCODB_BASE_ID.
 * No relative/alias imports: `scripts/nocodb.ts` runs this file directly with Node.
 */
export type Row = Record<string, unknown>;

function config() {
  const { NOCODB_URL, NOCODB_API_TOKEN } = process.env;
  if (!NOCODB_URL || !NOCODB_API_TOKEN) throw new Error('Thiếu NOCODB_URL hoặc NOCODB_API_TOKEN trong env');
  return { url: NOCODB_URL.replace(/\/+$/, ''), token: NOCODB_API_TOKEN };
}

export function baseId() {
  const id = process.env.NOCODB_BASE_ID;
  if (!id) throw new Error('Thiếu NOCODB_BASE_ID trong env');
  return id;
}

export async function nocodb<T = Row>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, token } = config();
  const res = await fetch(url + path, {
    ...init,
    headers: { 'xc-token': token, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`NocoDB ${res.status} ${init.method ?? 'GET'} ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

let tables: Promise<Map<string, string>> | undefined;

/** Table id by title; refetched when missing so tables created later are found without a restart. */
export async function tableId(title: string): Promise<string> {
  tables ??= nocodb<{ list: { id: string; title: string }[] }>(`/api/v2/meta/bases/${baseId()}/tables`).then(
    (r) => new Map(r.list.map((t) => [t.title, t.id])),
  );
  try {
    const id = (await tables).get(title);
    if (id) return id;
  } catch (error) {
    tables = undefined;
    throw error;
  }
  tables = undefined;
  throw new Error(`Không tìm thấy bảng "${title}" trong NocoDB`);
}

export async function insertRow(table: string, row: Row) {
  return nocodb(`/api/v2/tables/${await tableId(table)}/records`, { method: 'POST', body: JSON.stringify(row) });
}

/** `where` uses NocoDB syntax, e.g. `(username,eq,an)`. Values must not contain `,` `(` `)`. */
export async function findRow(table: string, where: string): Promise<Row | null> {
  const r = await nocodb<{ list: Row[] }>(
    `/api/v2/tables/${await tableId(table)}/records?where=${encodeURIComponent(where)}&limit=1`,
  );
  return r.list[0] ?? null;
}

/** `sort` like `-CreatedAt` (newest first). */
export async function listRows(table: string, { where = '', sort = '-CreatedAt', limit = 50 } = {}): Promise<Row[]> {
  const query = new URLSearchParams({ sort, limit: String(limit), ...(where && { where }) });
  return (await nocodb<{ list: Row[] }>(`/api/v2/tables/${await tableId(table)}/records?${query}`)).list;
}

export async function countRows(table: string, where = ''): Promise<number> {
  const query = where ? `?where=${encodeURIComponent(where)}` : '';
  return (await nocodb<{ count: number }>(`/api/v2/tables/${await tableId(table)}/records/count${query}`)).count;
}

export async function updateRow(table: string, row: Row & { Id: unknown }) {
  return nocodb(`/api/v2/tables/${await tableId(table)}/records`, { method: 'PATCH', body: JSON.stringify(row) });
}

/** JSON columns may come back as a parsed value or as a string depending on the backing DB. */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
