export interface ParsedAddress {
  formatted: string;
  segments: string[];
  pincode: string | null;
}

export interface SubscriberRecord {
  row_idx: number;
  mobile: string | null;
  name: string | null;
  fname: string | null;
  address: string | null;
  alt: string | null;
  circle: string | null;
  id: string | null;
  email: string | null;
  parsedAddress?: ParsedAddress;
  [key: string]: unknown;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  key: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  requestsCount: number;
  rateLimit: number;
  status: 'active' | 'revoked';
  scopes: string[];
}

export interface ApiLogItem {
  id: string;
  timestamp: string;
  endpoint: string;
  query: string;
  keyName: string;
  statusCode: number;
  latencyMs: number;
  matchesFound: number;
  source: string;
}

export interface LookupResponse {
  status: 'ok' | 'error';
  dataset: string;
  config: string;
  split: string;
  query: string;
  normalizedNumber: string;
  count: number;
  matches: SubscriberRecord[];
  error?: string;
  meta: {
    latencyMs: number;
    source: string;
    indexedRowsInMemory: number;
    hfIndexNotice: string | null;
  };
}

export interface SplitItem {
  dataset: string;
  config: string;
  split: string;
}

const STORAGE_KEYS_LIST = 'hitek_api_keys_v1';
const STORAGE_HF_TOKEN = 'hitek_hf_token_v1';

// Client-side fallback cache when hosted on static GitHub Pages
const clientIndexedRows = new Map<number, SubscriberRecord>();

export function parseAddressClient(raw: string | null | undefined): ParsedAddress {
  if (!raw) {
    return { formatted: 'Not provided', segments: [], pincode: null };
  }
  const segments = raw
    .split('!')
    .map((s) => s.trim())
    .filter(Boolean);
  const deduplicated: string[] = [];
  for (const seg of segments) {
    if (deduplicated[deduplicated.length - 1]?.toLowerCase() !== seg.toLowerCase()) {
      deduplicated.push(seg);
    }
  }
  const pinMatch = raw.match(/\b([1-9][0-9]{5})\b/);
  return {
    formatted: deduplicated.join(', ') || raw,
    segments: deduplicated,
    pincode: pinMatch ? pinMatch[1] : null,
  };
}

export function normalizePhoneClient(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits || input.trim();
}

export function getStoredHfToken(): string {
  try {
    return localStorage.getItem(STORAGE_HF_TOKEN) || '';
  } catch {
    return '';
  }
}

export function setStoredHfToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_HF_TOKEN, token.trim());
  } catch {
    // ignore storage errors
  }
}

export function getLocalFallbackKeys(): ApiKeyItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS_LIST);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  const defaults: ApiKeyItem[] = [
    {
      id: 'key_default_prod',
      name: 'Production Number Lookup Key',
      key: 'htk_live_9f8a7b6c5d4e3f2a1b0c',
      prefix: 'htk_live_9f8a...',
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      lastUsedAt: null,
      requestsCount: 14,
      rateLimit: 1000,
      status: 'active',
      scopes: ['lookup:mobile', 'rows:read', 'splits:read', 'parquet:read'],
    },
    {
      id: 'key_github_host',
      name: 'GitHub Pages Static Host Key',
      key: 'htk_github_pages_public_client',
      prefix: 'htk_github_pa...',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      lastUsedAt: null,
      requestsCount: 5,
      rateLimit: 500,
      status: 'active',
      scopes: ['lookup:mobile', 'rows:read'],
    },
  ];
  try {
    localStorage.setItem(STORAGE_KEYS_LIST, JSON.stringify(defaults));
  } catch {
    // ignore
  }
  return defaults;
}

function saveLocalFallbackKeys(keys: ApiKeyItem[]) {
  try {
    localStorage.setItem(STORAGE_KEYS_LIST, JSON.stringify(keys));
  } catch {
    // ignore
  }
}

function getClientHfHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getStoredHfToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function cacheClientRows(rows?: Array<{ row_idx: number; row: Record<string, unknown> }>) {
  if (!Array.isArray(rows)) return;
  for (const item of rows) {
    if (!item || !item.row) continue;
    const rec: SubscriberRecord = {
      row_idx: item.row_idx,
      mobile: item.row.mobile != null ? String(item.row.mobile) : null,
      name: item.row.name != null ? String(item.row.name) : null,
      fname: item.row.fname != null ? String(item.row.fname) : null,
      address: item.row.address != null ? String(item.row.address) : null,
      alt: item.row.alt != null ? String(item.row.alt) : null,
      circle: item.row.circle != null ? String(item.row.circle) : null,
      id: item.row.id != null ? String(item.row.id) : null,
      email: item.row.email != null ? String(item.row.email) : null,
      parsedAddress: parseAddressClient(
        item.row.address != null ? String(item.row.address) : null
      ),
      ...item.row,
    };
    clientIndexedRows.set(item.row_idx, rec);
  }
}

export async function fetchApiKeysState(): Promise<{
  keys: ApiKeyItem[];
  logs: ApiLogItem[];
  indexedRowsCount: number;
  hfTokenConfigured: boolean;
}> {
  try {
    const res = await fetch('/api/keys');
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      saveLocalFallbackKeys(data.keys || []);
      return {
        keys: data.keys || [],
        logs: data.logs || [],
        indexedRowsCount: Math.max(data.indexedRowsCount || 0, clientIndexedRows.size),
        hfTokenConfigured: Boolean(data.hfTokenConfigured || getStoredHfToken()),
      };
    }
  } catch {
    // Fallback to static mode
  }
  return {
    keys: getLocalFallbackKeys(),
    logs: [],
    indexedRowsCount: clientIndexedRows.size,
    hfTokenConfigured: Boolean(getStoredHfToken()),
  };
}

export async function createApiKey(
  name: string,
  rateLimit: number,
  scopes: string[]
): Promise<ApiKeyItem> {
  try {
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rateLimit, scopes }),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      const current = getLocalFallbackKeys();
      saveLocalFallbackKeys([data.key, ...current]);
      return data.key;
    }
  } catch {
    // Fallback to static mode
  }
  const randomHex = Array.from({ length: 20 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  const newKey = `htk_live_${randomHex}`;
  const created: ApiKeyItem = {
    id: `key_${Date.now()}`,
    name: name.trim() || 'Custom API Key',
    key: newKey,
    prefix: `${newKey.slice(0, 13)}...`,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    requestsCount: 0,
    rateLimit,
    status: 'active',
    scopes,
  };
  const current = getLocalFallbackKeys();
  saveLocalFallbackKeys([created, ...current]);
  return created;
}

export async function toggleApiKeyStatus(
  keyString: string,
  status: 'active' | 'revoked'
): Promise<void> {
  try {
    await fetch(`/api/keys/${encodeURIComponent(keyString)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  } catch {
    // Static mode
  }
  const updated = getLocalFallbackKeys().map((k) =>
    k.key === keyString ? { ...k, status } : k
  );
  saveLocalFallbackKeys(updated);
}

export async function deleteApiKey(keyString: string): Promise<void> {
  try {
    await fetch(`/api/keys/${encodeURIComponent(keyString)}`, {
      method: 'DELETE',
    });
  } catch {
    // Static mode
  }
  const updated = getLocalFallbackKeys().filter((k) => k.key !== keyString);
  saveLocalFallbackKeys(updated);
}

export async function lookupSubscriberByQuery(params: {
  query: string;
  apiKey: string;
  dataset?: string;
  config?: string;
  split?: string;
  forceHf?: boolean;
}): Promise<LookupResponse> {
  const dataset = params.dataset || 'bashabashi420/hitek-india';
  const config = params.config || 'default';
  const split = params.split || 'train';
  const q = params.query.trim();

  // Try backend /api/v1/lookup first
  try {
    const url = `/api/v1/lookup?number=${encodeURIComponent(q)}&dataset=${encodeURIComponent(
      dataset
    )}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(
      split
    )}&api_key=${encodeURIComponent(params.apiKey)}${params.forceHf ? '&force_hf=true' : ''}`;

    const res = await fetch(url);
    if (res.headers.get('content-type')?.includes('application/json')) {
      const data = (await res.json()) as LookupResponse;
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (Array.isArray(data.matches)) {
        for (const m of data.matches) {
          clientIndexedRows.set(m.row_idx, {
            ...m,
            parsedAddress: m.parsedAddress || parseAddressClient(m.address),
          });
        }
      }
      return data;
    }
  } catch (err) {
    if (err instanceof Error && (err.message.includes('API key') || err.message.includes('revoked'))) {
      throw err;
    }
    // Otherwise fall through to direct browser Hugging Face lookup (GitHub Pages mode)
  }

  // Direct client-side lookup against Hugging Face datasets-server
  const startTime = Date.now();
  const localKeys = getLocalFallbackKeys();
  const matchedKey = localKeys.find((k) => k.key === params.apiKey);
  if (!params.apiKey) {
    throw new Error('Missing API key. Select or enter a valid API key.');
  }
  if (matchedKey && matchedKey.status === 'revoked') {
    throw new Error('This API key has been revoked.');
  }

  if (clientIndexedRows.size === 0) {
    await fetchDatasetRows({ dataset, config, split, offset: 0, length: 100, apiKey: params.apiKey });
  }

  const norm = normalizePhoneClient(q);
  const qLower = q.toLowerCase();
  const matchesMap = new Map<number, SubscriberRecord>();

  for (const row of clientIndexedRows.values()) {
    const mNorm = row.mobile ? normalizePhoneClient(row.mobile) : '';
    const aNorm = row.alt ? normalizePhoneClient(row.alt) : '';
    if (
      mNorm.includes(norm) ||
      (norm.length >= 4 && aNorm.includes(norm)) ||
      (row.name && row.name.toLowerCase().includes(qLower)) ||
      (row.fname && row.fname.toLowerCase().includes(qLower)) ||
      (row.id && row.id.toLowerCase().includes(qLower)) ||
      (row.email && row.email.toLowerCase().includes(qLower)) ||
      (row.address && row.address.toLowerCase().includes(qLower))
    ) {
      matchesMap.set(row.row_idx, row);
    }
  }

  let source = 'client_indexed_cache';
  let hfIndexNotice: string | null = null;

  if (matchesMap.size === 0 || params.forceHf) {
    const isDigits = /^\d{6,15}$/.test(norm);
    const whereClause = isDigits
      ? `"mobile"='${norm}'`
      : `"name" ILIKE '%${q.replace(/'/g, "''")}%'`;

    const filterUrl = `https://datasets-server.huggingface.co/filter?dataset=${encodeURIComponent(
      dataset
    )}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(
      split
    )}&where=${encodeURIComponent(whereClause)}&offset=0&length=25`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const hfRes = await fetch(filterUrl, {
        headers: getClientHfHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await hfRes.json();
      if (Array.isArray(data.rows) && data.rows.length > 0) {
        cacheClientRows(data.rows);
        for (const item of data.rows) {
          const rec = clientIndexedRows.get(item.row_idx);
          if (rec) matchesMap.set(item.row_idx, rec);
        }
        source = 'hf_datasets_filter_direct';
      } else if (data.error) {
        hfIndexNotice = data.error;
      }
    } catch {
      // ignore timeout
    }
  }

  const matches = Array.from(matchesMap.values()).slice(0, 50);
  return {
    status: 'ok',
    dataset,
    config,
    split,
    query: q,
    normalizedNumber: norm,
    count: matches.length,
    matches,
    meta: {
      latencyMs: Date.now() - startTime,
      source,
      indexedRowsInMemory: clientIndexedRows.size,
      hfIndexNotice,
    },
  };
}

export async function fetchDatasetRows(params: {
  dataset?: string;
  config?: string;
  split?: string;
  offset: number;
  length: number;
  apiKey: string;
}): Promise<{
  rows: SubscriberRecord[];
  numRowsTotal: number;
  indexedRowsInMemory: number;
}> {
  const dataset = params.dataset || 'bashabashi420/hitek-india';
  const config = params.config || 'default';
  const split = params.split || 'train';

  try {
    const res = await fetch(
      `/api/v1/rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(
        config
      )}&split=${encodeURIComponent(split)}&offset=${params.offset}&length=${
        params.length
      }&api_key=${encodeURIComponent(params.apiKey)}`
    );
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      cacheClientRows(data.rows);
      const formatted: SubscriberRecord[] = (data.rows || []).map(
        (item: { row_idx: number; row: Record<string, unknown> }) => ({
          row_idx: item.row_idx,
          ...item.row,
          parsedAddress: parseAddressClient(
            item.row?.address != null ? String(item.row.address) : null
          ),
        })
      );
      return {
        rows: formatted,
        numRowsTotal: data.num_rows_total || 1782434387,
        indexedRowsInMemory: Math.max(data.indexedRowsInMemory || 0, clientIndexedRows.size),
      };
    }
  } catch {
    // Direct Hugging Face fallback
  }

  const hfUrl = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(
    dataset
  )}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}&offset=${
    params.offset
  }&length=${params.length}`;
  const hfRes = await fetch(hfUrl, { headers: getClientHfHeaders() });
  const data = await hfRes.json();
  cacheClientRows(data.rows);
  const formatted: SubscriberRecord[] = (data.rows || []).map(
    (item: { row_idx: number; row: Record<string, unknown> }) => ({
      row_idx: item.row_idx,
      ...item.row,
      parsedAddress: parseAddressClient(
        item.row?.address != null ? String(item.row.address) : null
      ),
    })
  );
  return {
    rows: formatted,
    numRowsTotal: data.num_rows_total || 1782434387,
    indexedRowsInMemory: clientIndexedRows.size,
  };
}

export async function scanMultipleRowBatches(params: {
  startOffset: number;
  batches: number;
  dataset?: string;
  apiKey: string;
}): Promise<{ newlyFetchedRows: number; totalIndexedRows: number }> {
  const dataset = params.dataset || 'bashabashi420/hitek-india';
  try {
    const res = await fetch('/api/v1/scan-range', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': params.apiKey,
      },
      body: JSON.stringify({
        startOffset: params.startOffset,
        batches: params.batches,
        dataset,
      }),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return {
        newlyFetchedRows: data.newlyFetchedRows || 0,
        totalIndexedRows: data.totalIndexedRows || clientIndexedRows.size,
      };
    }
  } catch {
    // Fallback to client batch scan
  }

  let newlyFetchedRows = 0;
  const safeBatches = Math.min(8, Math.max(1, params.batches));
  await Promise.allSettled(
    Array.from({ length: safeBatches }, (_, i) => {
      const offset = params.startOffset + i * 100;
      return fetchDatasetRows({
        dataset,
        offset,
        length: 100,
        apiKey: params.apiKey,
      }).then((r) => {
        newlyFetchedRows += r.rows.length;
      });
    })
  );

  return {
    newlyFetchedRows,
    totalIndexedRows: clientIndexedRows.size,
  };
}

export async function fetchDatasetSplitsAndParquet(params: {
  dataset?: string;
  config?: string;
  split?: string;
  apiKey: string;
}): Promise<{
  splits: SplitItem[];
  parquetFiles: string[];
}> {
  const dataset = params.dataset || 'bashabashi420/hitek-india';
  const config = params.config || 'default';
  const split = params.split || 'train';

  let splits: SplitItem[] = [];
  let parquetFiles: string[] = [];

  try {
    const [splitsRes, parquetRes] = await Promise.all([
      fetch(
        `/api/v1/splits?dataset=${encodeURIComponent(dataset)}&api_key=${encodeURIComponent(
          params.apiKey
        )}`
      ),
      fetch(
        `/api/v1/parquet?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(
          config
        )}&split=${encodeURIComponent(split)}&api_key=${encodeURIComponent(params.apiKey)}`
      ),
    ]);

    if (splitsRes.ok && splitsRes.headers.get('content-type')?.includes('application/json')) {
      const sData = await splitsRes.json();
      splits = Array.isArray(sData.splits) ? sData.splits : [];
    }
    if (parquetRes.ok && parquetRes.headers.get('content-type')?.includes('application/json')) {
      const pData = await parquetRes.json();
      parquetFiles = Array.isArray(pData.parquetFiles) ? pData.parquetFiles : [];
    }
    if (splits.length > 0 || parquetFiles.length > 0) {
      return { splits, parquetFiles };
    }
  } catch {
    // Fallback to direct Hugging Face API calls
  }

  try {
    const [sRes, pRes] = await Promise.all([
      fetch(
        `https://datasets-server.huggingface.co/splits?dataset=${encodeURIComponent(dataset)}`,
        { headers: getClientHfHeaders() }
      ),
      fetch(
        `https://huggingface.co/api/datasets/${dataset}/parquet/${encodeURIComponent(
          config
        )}/${encodeURIComponent(split)}`,
        { headers: getClientHfHeaders() }
      ),
    ]);
    if (sRes.ok) {
      const sData = await sRes.json();
      splits = Array.isArray(sData.splits) ? sData.splits : [];
    }
    if (pRes.ok) {
      const pData = await pRes.json();
      parquetFiles = Array.isArray(pData) ? pData : [];
    }
  } catch {
    // ignore
  }

  return { splits, parquetFiles };
}
