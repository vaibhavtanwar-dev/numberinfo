import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

export interface SubscriberRow {
  row_idx: number;
  mobile: string | null;
  name: string | null;
  fname: string | null;
  address: string | null;
  alt: string | null;
  circle: string | null;
  id: string | null;
  email: string | null;
  [key: string]: unknown;
}

export interface ApiKeyRecord {
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

export interface ApiRequestLog {
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

const DEFAULT_DATASET = 'bashabashi420/hitek-india';
const DEFAULT_CONFIG = 'default';
const DEFAULT_SPLIT = 'train';

// In-memory indexed row store for instant (<2ms) lookups on loaded shards
const indexedRowsMap = new Map<number, SubscriberRow>();
const mobileIndexMap = new Map<string, SubscriberRow[]>();

// Seed default API keys
const apiKeys = new Map<string, ApiKeyRecord>([
  [
    'htk_live_9f8a7b6c5d4e3f2a1b0c',
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
  ],
  [
    'htk_github_pages_public_client',
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
  ],
]);

const requestLogs: ApiRequestLog[] = [];

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits || input.trim();
}

export function parseRawAddress(raw: string | null | undefined) {
  if (!raw) {
    return {
      formatted: 'Not available',
      segments: [] as string[],
      pincode: null as string | null,
    };
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

function indexRowsBatch(rowsPayload: Array<{ row_idx: number; row: Record<string, unknown> }>) {
  if (!Array.isArray(rowsPayload)) return;
  for (const item of rowsPayload) {
    if (!item || typeof item.row !== 'object' || item.row === null) continue;
    const record: SubscriberRow = {
      row_idx: item.row_idx,
      mobile: item.row.mobile != null ? String(item.row.mobile) : null,
      name: item.row.name != null ? String(item.row.name) : null,
      fname: item.row.fname != null ? String(item.row.fname) : null,
      address: item.row.address != null ? String(item.row.address) : null,
      alt: item.row.alt != null ? String(item.row.alt) : null,
      circle: item.row.circle != null ? String(item.row.circle) : null,
      id: item.row.id != null ? String(item.row.id) : null,
      email: item.row.email != null ? String(item.row.email) : null,
      ...item.row,
    };
    indexedRowsMap.set(item.row_idx, record);
    if (record.mobile) {
      const norm = normalizePhone(record.mobile);
      const existing = mobileIndexMap.get(norm) || [];
      if (!existing.some((r) => r.row_idx === record.row_idx)) {
        existing.push(record);
        mobileIndexMap.set(norm, existing);
      }
    }
  }
}

function getHfHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const token = process.env.HF_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function prewarmInitialRows() {
  try {
    const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(
      DEFAULT_DATASET
    )}&config=${encodeURIComponent(DEFAULT_CONFIG)}&split=${encodeURIComponent(
      DEFAULT_SPLIT
    )}&offset=0&length=100`;
    const res = await fetchWithTimeout(url, { headers: getHfHeaders() }, 8000);
    if (res.ok) {
      const data = (await res.json()) as { rows?: Array<{ row_idx: number; row: Record<string, unknown> }> };
      if (data.rows) {
        indexRowsBatch(data.rows);
      }
    }
  } catch {
    // Non-fatal prewarm error
  }
}

function validateApiKey(req: express.Request): {
  valid: boolean;
  code: number;
  error?: string;
  keyRecord?: ApiKeyRecord;
} {
  const rawKey =
    (req.query.api_key as string) ||
    (req.headers['x-api-key'] as string) ||
    (req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : '');

  if (!rawKey) {
    if (process.env.REQUIRE_API_KEY === 'true') {
      return {
        valid: false,
        code: 401,
        error: 'Missing API key. Pass ?api_key=YOUR_KEY or X-API-Key header.',
      };
    }
    const defaultRecord = apiKeys.get('htk_live_9f8a7b6c5d4e3f2a1b0c');
    if (defaultRecord) {
      defaultRecord.lastUsedAt = new Date().toISOString();
      defaultRecord.requestsCount += 1;
    }
    return {
      valid: true,
      code: 200,
      keyRecord: defaultRecord || {
        id: 'key_public_direct',
        name: 'Direct Public URL',
        key: 'public',
        prefix: 'public',
        createdAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        requestsCount: 1,
        rateLimit: 1000,
        status: 'active',
        scopes: ['lookup:mobile', 'rows:read', 'splits:read', 'parquet:read'],
      },
    };
  }

  let record = apiKeys.get(rawKey);
  // Also accept client-generated keys with htk_ prefix so browser-persisted keys work seamlessly
  if (!record && rawKey.startsWith('htk_') && rawKey.length >= 12) {
    record = {
      id: `key_${rawKey.slice(0, 12)}`,
      name: 'Client Session Key',
      key: rawKey,
      prefix: `${rawKey.slice(0, 12)}...`,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      requestsCount: 0,
      rateLimit: 1000,
      status: 'active',
      scopes: ['lookup:mobile', 'rows:read', 'splits:read', 'parquet:read'],
    };
    apiKeys.set(rawKey, record);
  }

  if (!record) {
    return {
      valid: false,
      code: 401,
      error: 'Invalid API key provided.',
    };
  }

  if (record.status === 'revoked') {
    return {
      valid: false,
      code: 403,
      error: 'This API key has been revoked.',
    };
  }

  record.lastUsedAt = new Date().toISOString();
  record.requestsCount += 1;
  return { valid: true, code: 200, keyRecord: record };
}

function recordApiLog(entry: Omit<ApiRequestLog, 'id' | 'timestamp'>) {
  requestLogs.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (requestLogs.length > 50) {
    requestLogs.length = 50;
  }
}

const app = express();
app.use(express.json());

// Enable CORS so GitHub Pages or external clients can call this API directly
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// --- API KEY MANAGEMENT ENDPOINTS ---
app.get('/api/keys', (_req, res) => {
  res.json({
    keys: Array.from(apiKeys.values()),
    logs: requestLogs.slice(0, 25),
    indexedRowsCount: indexedRowsMap.size,
    hfTokenConfigured: Boolean(process.env.HF_TOKEN?.trim()),
  });
});

app.post('/api/keys', (req, res) => {
  const {
    name,
    rateLimit = 1000,
    scopes = ['lookup:mobile', 'rows:read', 'splits:read', 'parquet:read'],
  } = req.body || {};
  const randomHex = Array.from({ length: 20 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  const newKey = `htk_live_${randomHex}`;
  const record: ApiKeyRecord = {
    id: `key_${Date.now()}`,
    name: (name || 'Custom Lookup Key').trim(),
    key: newKey,
    prefix: `${newKey.slice(0, 13)}...`,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    requestsCount: 0,
    rateLimit: Number(rateLimit) || 1000,
    status: 'active',
    scopes: Array.isArray(scopes) ? scopes : ['lookup:mobile', 'rows:read'],
  };
  apiKeys.set(newKey, record);
  res.status(201).json({ key: record });
});

app.patch('/api/keys/:keyString', (req, res) => {
  const { keyString } = req.params;
  const record = apiKeys.get(keyString);
  if (!record) {
    res.status(404).json({ error: 'API key not found' });
    return;
  }
  if (req.body.status === 'active' || req.body.status === 'revoked') {
    record.status = req.body.status;
  }
  res.json({ key: record });
});

app.delete('/api/keys/:keyString', (req, res) => {
  const { keyString } = req.params;
  apiKeys.delete(keyString);
  res.json({ deleted: true });
});

// --- CORE NUMBER / SUBSCRIBER LOOKUP ENDPOINT ---
app.get(
  ['/api/v1/lookup', '/api/v1/lookup/:numberParam', '/api/lookup', '/api/lookup/:numberParam'],
  async (req, res) => {
    const startTime = Date.now();
    const auth = validateApiKey(req);
    const rawQuery = String(
      req.params.numberParam || req.query.number || req.query.mobile || req.query.query || req.query.q || ''
    ).trim();
  const dataset = String(req.query.dataset || DEFAULT_DATASET).trim();
  const config = String(req.query.config || DEFAULT_CONFIG).trim();
  const split = String(req.query.split || DEFAULT_SPLIT).trim();

  if (!auth.valid) {
    recordApiLog({
      endpoint: '/api/v1/lookup',
      query: rawQuery || '(empty)',
      keyName: 'Unauthorized',
      statusCode: auth.code,
      latencyMs: Date.now() - startTime,
      matchesFound: 0,
      source: 'auth_gate',
    });
    res.status(auth.code).json({
      status: 'error',
      error: auth.error,
    });
    return;
  }

  if (!rawQuery) {
    res.status(400).json({
      status: 'error',
      error: 'Please provide a mobile number or search query via ?number=9999999891',
    });
    return;
  }

  const normalizedQuery = normalizePhone(rawQuery);
  const queryLower = rawQuery.toLowerCase();

  // Ensure initial rows are prewarmed if cache is empty
  if (indexedRowsMap.size === 0) {
    await prewarmInitialRows();
  }

  const matchedMap = new Map<number, SubscriberRow>();
  let primarySource = 'indexed_cache';
  let hfIndexNotice: string | null = null;

  // 1. Check fast in-memory mobile & multi-field index
  const exactMobileHits = mobileIndexMap.get(normalizedQuery) || [];
  for (const hit of exactMobileHits) {
    matchedMap.set(hit.row_idx, hit);
  }

  for (const row of indexedRowsMap.values()) {
    const mobileNorm = row.mobile ? normalizePhone(row.mobile) : '';
    const altNorm = row.alt ? normalizePhone(row.alt) : '';
    if (
      mobileNorm.includes(normalizedQuery) ||
      (normalizedQuery.length >= 4 && altNorm.includes(normalizedQuery)) ||
      (row.name && row.name.toLowerCase().includes(queryLower)) ||
      (row.fname && row.fname.toLowerCase().includes(queryLower)) ||
      (row.id && row.id.toLowerCase().includes(queryLower)) ||
      (row.email && row.email.toLowerCase().includes(queryLower)) ||
      (row.address && row.address.toLowerCase().includes(queryLower))
    ) {
      matchedMap.set(row.row_idx, row);
    }
  }

  // 2. If not already matched in local cache (or if user asks for live HF query), query Hugging Face /filter & /search
  if (matchedMap.size === 0 || req.query.force_hf === 'true') {
    const isDigitsOnly = /^\d{6,15}$/.test(normalizedQuery);
    const whereClause = isDigitsOnly
      ? `"mobile"='${normalizedQuery}'`
      : `"name" ILIKE '%${rawQuery.replace(/'/g, "''")}%'`;

    const filterUrl = `https://datasets-server.huggingface.co/filter?dataset=${encodeURIComponent(
      dataset
    )}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(
      split
    )}&where=${encodeURIComponent(whereClause)}&offset=0&length=25`;

    const searchUrl = `https://datasets-server.huggingface.co/search?dataset=${encodeURIComponent(
      dataset
    )}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(
      split
    )}&query=${encodeURIComponent(normalizedQuery)}&offset=0&length=25`;

    const [filterResult, searchResult] = await Promise.allSettled([
      fetchWithTimeout(filterUrl, { headers: getHfHeaders() }, 4500),
      fetchWithTimeout(searchUrl, { headers: getHfHeaders() }, 4500),
    ]);

    if (filterResult.status === 'fulfilled') {
      try {
        const data = (await filterResult.value.json()) as {
          rows?: Array<{ row_idx: number; row: Record<string, unknown> }>;
          error?: string;
        };
        if (data.rows && data.rows.length > 0) {
          indexRowsBatch(data.rows);
          for (const item of data.rows) {
            const r = indexedRowsMap.get(item.row_idx);
            if (r) matchedMap.set(r.row_idx, r);
          }
          primarySource = 'hf_datasets_filter';
        } else if (data.error) {
          hfIndexNotice = data.error;
        }
      } catch {
        // ignore parse error
      }
    }

    if (searchResult.status === 'fulfilled' && matchedMap.size === 0) {
      try {
        const data = (await searchResult.value.json()) as {
          rows?: Array<{ row_idx: number; row: Record<string, unknown> }>;
          error?: string;
        };
        if (data.rows && data.rows.length > 0) {
          indexRowsBatch(data.rows);
          for (const item of data.rows) {
            const r = indexedRowsMap.get(item.row_idx);
            if (r) matchedMap.set(r.row_idx, r);
          }
          primarySource = 'hf_datasets_search';
        } else if (data.error && !hfIndexNotice) {
          hfIndexNotice = data.error;
        }
      } catch {
        // ignore parse error
      }
    }
  }

  const matches = Array.from(matchedMap.values())
    .slice(0, 50)
    .map((row) => ({
      ...row,
      parsedAddress: parseRawAddress(row.address),
    }));

  const latencyMs = Date.now() - startTime;
  recordApiLog({
    endpoint: '/api/v1/lookup',
    query: rawQuery,
    keyName: auth.keyRecord?.name || 'API Key',
    statusCode: 200,
    latencyMs,
    matchesFound: matches.length,
    source: primarySource,
  });

  res.json({
    status: 'ok',
    dataset,
    config,
    split,
    query: rawQuery,
    normalizedNumber: normalizedQuery,
    count: matches.length,
    matches,
    meta: {
      latencyMs,
      source: primarySource,
      indexedRowsInMemory: indexedRowsMap.size,
      hfIndexNotice,
    },
  });
});

// --- DATASET ROWS PROXY & AUTO-INDEXER ---
app.get('/api/v1/rows', async (req, res) => {
  const startTime = Date.now();
  const auth = validateApiKey(req);
  if (!auth.valid) {
    res.status(auth.code).json({ status: 'error', error: auth.error });
    return;
  }

  const dataset = String(req.query.dataset || DEFAULT_DATASET).trim();
  const config = String(req.query.config || DEFAULT_CONFIG).trim();
  const split = String(req.query.split || DEFAULT_SPLIT).trim();
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const length = Math.min(100, Math.max(1, Number(req.query.length) || 100));

  try {
    const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(
      dataset
    )}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(
      split
    )}&offset=${offset}&length=${length}`;

    const hfRes = await fetchWithTimeout(url, { headers: getHfHeaders() }, 10000);
    const data = (await hfRes.json()) as {
      features?: unknown[];
      rows?: Array<{ row_idx: number; row: Record<string, unknown> }>;
      num_rows_total?: number;
      error?: string;
    };

    if (data.rows) {
      indexRowsBatch(data.rows);
    }

    recordApiLog({
      endpoint: '/api/v1/rows',
      query: `offset=${offset}&length=${length}`,
      keyName: auth.keyRecord?.name || 'API Key',
      statusCode: hfRes.status,
      latencyMs: Date.now() - startTime,
      matchesFound: data.rows?.length || 0,
      source: 'hf_datasets_rows',
    });

    res.status(hfRes.status).json({
      ...data,
      indexedRowsInMemory: indexedRowsMap.size,
    });
  } catch (err) {
    res.status(502).json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to fetch rows from Hugging Face',
    });
  }
});

// --- DATASET SPLITS PROXY ---
app.get('/api/v1/splits', async (req, res) => {
  const startTime = Date.now();
  const auth = validateApiKey(req);
  if (!auth.valid) {
    res.status(auth.code).json({ status: 'error', error: auth.error });
    return;
  }

  const dataset = String(req.query.dataset || DEFAULT_DATASET).trim();
  try {
    const url = `https://datasets-server.huggingface.co/splits?dataset=${encodeURIComponent(
      dataset
    )}`;
    const hfRes = await fetchWithTimeout(url, { headers: getHfHeaders() }, 8000);
    const data = await hfRes.json();

    recordApiLog({
      endpoint: '/api/v1/splits',
      query: dataset,
      keyName: auth.keyRecord?.name || 'API Key',
      statusCode: hfRes.status,
      latencyMs: Date.now() - startTime,
      matchesFound: Array.isArray(data?.splits) ? data.splits.length : 0,
      source: 'hf_datasets_splits',
    });

    res.status(hfRes.status).json(data);
  } catch (err) {
    res.status(502).json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to fetch splits from Hugging Face',
    });
  }
});

// --- DATASET PARQUET FILES PROXY ---
app.get('/api/v1/parquet', async (req, res) => {
  const startTime = Date.now();
  const auth = validateApiKey(req);
  if (!auth.valid) {
    res.status(auth.code).json({ status: 'error', error: auth.error });
    return;
  }

  const dataset = String(req.query.dataset || DEFAULT_DATASET).trim();
  const config = String(req.query.config || DEFAULT_CONFIG).trim();
  const split = String(req.query.split || DEFAULT_SPLIT).trim();

  try {
    const url = `https://huggingface.co/api/datasets/${dataset}/parquet/${encodeURIComponent(
      config
    )}/${encodeURIComponent(split)}`;
    const hfRes = await fetchWithTimeout(url, { headers: getHfHeaders() }, 8000);
    const data = await hfRes.json();

    recordApiLog({
      endpoint: '/api/v1/parquet',
      query: `${dataset}/${config}/${split}`,
      keyName: auth.keyRecord?.name || 'API Key',
      statusCode: hfRes.status,
      latencyMs: Date.now() - startTime,
      matchesFound: Array.isArray(data) ? data.length : 0,
      source: 'hf_api_parquet',
    });

    res.status(hfRes.status).json({
      dataset,
      config,
      split,
      parquetFiles: Array.isArray(data) ? data : [],
    });
  } catch (err) {
    res.status(502).json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Failed to fetch Parquet list from Hugging Face',
    });
  }
});

// --- MULTI-BATCH OFFSET SCANNER ---
app.post('/api/v1/scan-range', async (req, res) => {
  const auth = validateApiKey(req);
  if (!auth.valid) {
    res.status(auth.code).json({ status: 'error', error: auth.error });
    return;
  }

  const { startOffset = 0, batches = 5, dataset = DEFAULT_DATASET } = req.body || {};
  const safeBatches = Math.min(10, Math.max(1, Number(batches) || 5));
  const baseOffset = Math.max(0, Number(startOffset) || 0);

  const offsets = Array.from({ length: safeBatches }, (_, idx) => baseOffset + idx * 100);
  let newlyIndexed = 0;

  await Promise.allSettled(
    offsets.map(async (offset) => {
      const url = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(
        dataset
      )}&config=default&split=train&offset=${offset}&length=100`;
      const hfRes = await fetchWithTimeout(url, { headers: getHfHeaders() }, 9000);
      if (hfRes.ok) {
        const data = (await hfRes.json()) as {
          rows?: Array<{ row_idx: number; row: Record<string, unknown> }>;
        };
        if (data.rows) {
          indexRowsBatch(data.rows);
          newlyIndexed += data.rows.length;
        }
      }
    })
  );

  res.json({
    status: 'ok',
    scannedBatches: safeBatches,
    startOffset: baseOffset,
    endOffset: baseOffset + safeBatches * 100,
    newlyFetchedRows: newlyIndexed,
    totalIndexedRows: indexedRowsMap.size,
  });
});

export default app;

async function startServer() {
  const PORT = 3000;

  // Pre-warm first 100 rows in background
  prewarmInitialRows();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}
