import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Key,
  Database,
  Layers,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  SubscriberRecord,
  ApiKeyItem,
  ApiLogItem,
  LookupResponse,
  fetchApiKeysState,
  createApiKey,
  toggleApiKeyStatus,
  deleteApiKey,
  lookupSubscriberByQuery,
  fetchDatasetRows,
  scanMultipleRowBatches,
} from './services/datasetClient';
import { SubscriberDossierCard } from './components/SubscriberDossierCard';
import { ApiKeysPanel } from './components/ApiKeysPanel';
import { GitHubHostPanel } from './components/GitHubHostPanel';
import { DatasetBrowserPanel } from './components/DatasetBrowserPanel';

type ActiveTab = 'lookup' | 'browser' | 'apikeys' | 'github';

const DEFAULT_DATASET = 'bashabashi420/hitek-india';
const DEFAULT_CONFIG = 'default';
const DEFAULT_SPLIT = 'train';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('lookup');

  // Dataset & API Key State
  const [datasetId, setDatasetId] = useState(DEFAULT_DATASET);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [logs, setLogs] = useState<ApiLogItem[]>([]);
  const [selectedApiKey, setSelectedApiKey] = useState('htk_live_9f8a7b6c5d4e3f2a1b0c');
  const [indexedRowsCount, setIndexedRowsCount] = useState(0);

  // Lookup State
  const [searchInput, setSearchInput] = useState('9999999891');
  const [lookupResult, setLookupResult] = useState<LookupResponse | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Dataset Browser State
  const [browserRows, setBrowserRows] = useState<SubscriberRecord[]>([]);
  const [browserOffset, setBrowserOffset] = useState(0);
  const [numRowsTotal, setNumRowsTotal] = useState(1782434387);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [scanningBatches, setScanningBatches] = useState(false);

  const loadKeysAndInitialRows = useCallback(async () => {
    const state = await fetchApiKeysState();
    setKeys(state.keys);
    setLogs(state.logs);
    if (state.indexedRowsCount > 0) {
      setIndexedRowsCount(state.indexedRowsCount);
    }
    const firstActive = state.keys.find((k) => k.status === 'active');
    const activeKeyToUse = firstActive ? firstActive.key : selectedApiKey;
    if (firstActive && !state.keys.some((k) => k.key === selectedApiKey)) {
      setSelectedApiKey(firstActive.key);
    }

    setBrowserLoading(true);
    try {
      const batch = await fetchDatasetRows({
        dataset: datasetId,
        config: DEFAULT_CONFIG,
        split: DEFAULT_SPLIT,
        offset: 0,
        length: 100,
        apiKey: activeKeyToUse,
      });
      setBrowserRows(batch.rows);
      setNumRowsTotal(batch.numRowsTotal);
      setIndexedRowsCount(batch.indexedRowsInMemory);

      // Run initial lookup for the default sample number so user sees real data immediately
      const initialLookup = await lookupSubscriberByQuery({
        query: '9999999891',
        apiKey: activeKeyToUse,
        dataset: datasetId,
      });
      setLookupResult(initialLookup);
    } catch {
      // handled in UI state
    } finally {
      setBrowserLoading(false);
    }
  }, [datasetId]);

  useEffect(() => {
    loadKeysAndInitialRows();
  }, [loadKeysAndInitialRows]);

  const handleRunLookup = async (
    customQuery?: string,
    forceHf = false
  ) => {
    const q = (customQuery !== undefined ? customQuery : searchInput).trim();
    if (!q) {
      setLookupError('Please enter a 10-digit mobile number, subscriber name, or ID.');
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    try {
      const res = await lookupSubscriberByQuery({
        query: q,
        apiKey: selectedApiKey,
        dataset: datasetId,
        config: DEFAULT_CONFIG,
        split: DEFAULT_SPLIT,
        forceHf,
      });
      setLookupResult(res);
      setIndexedRowsCount(res.meta.indexedRowsInMemory);
      const updatedState = await fetchApiKeysState();
      setKeys(updatedState.keys);
      setLogs(updatedState.logs);
    } catch (err) {
      setLookupError(
        err instanceof Error ? err.message : 'Unable to complete number lookup.'
      );
    } finally {
      setLookupLoading(false);
    }
  };

  const handleLoadOffsetBatch = async (newOffset: number) => {
    setBrowserOffset(newOffset);
    setBrowserLoading(true);
    try {
      const batch = await fetchDatasetRows({
        dataset: datasetId,
        config: DEFAULT_CONFIG,
        split: DEFAULT_SPLIT,
        offset: newOffset,
        length: 100,
        apiKey: selectedApiKey,
      });
      setBrowserRows(batch.rows);
      setNumRowsTotal(batch.numRowsTotal);
      setIndexedRowsCount(batch.indexedRowsInMemory);
    } finally {
      setBrowserLoading(false);
    }
  };

  const handleScanMoreRows = async () => {
    setScanningBatches(true);
    try {
      const res = await scanMultipleRowBatches({
        startOffset: indexedRowsCount,
        batches: 5,
        dataset: datasetId,
        apiKey: selectedApiKey,
      });
      setIndexedRowsCount(res.totalIndexedRows);
      if (searchInput.trim()) {
        await handleRunLookup(searchInput.trim(), false);
      }
    } finally {
      setScanningBatches(false);
    }
  };

  const handleCreateApiKey = async (name: string, rateLimit: number) => {
    const created = await createApiKey(name, rateLimit, [
      'lookup:mobile',
      'rows:read',
      'splits:read',
      'parquet:read',
    ]);
    setSelectedApiKey(created.key);
    const updated = await fetchApiKeysState();
    setKeys(updated.keys);
    setLogs(updated.logs);
  };

  const handleToggleApiKey = async (
    keyString: string,
    status: 'active' | 'revoked'
  ) => {
    await toggleApiKeyStatus(keyString, status);
    const updated = await fetchApiKeysState();
    setKeys(updated.keys);
  };

  const handleDeleteApiKey = async (keyString: string) => {
    await deleteApiKey(keyString);
    const updated = await fetchApiKeysState();
    setKeys(updated.keys);
    if (selectedApiKey === keyString && updated.keys.length > 0) {
      setSelectedApiKey(updated.keys[0].key);
    }
  };

  // Sample quick-lookup numbers from the loaded dataset rows
  const sampleNumbers =
    browserRows.length > 0
      ? browserRows
          .slice(0, 6)
          .map((r) => ({
            mobile: String(r.mobile || ''),
            name: String(r.name || ''),
          }))
          .filter((s) => s.mobile)
      : [
          { mobile: '9999999891', name: 'Krishan Bidhuri' },
          { mobile: '9999999751', name: 'Manoj Sharawat' },
          { mobile: '9999999733', name: 'Rhythm Makhija' },
        ];

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/90 bg-slate-950/90 sticky top-0 z-30 backdrop-blur-md">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#lookup"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('lookup');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap"
        >
          HiTek India Dataset Console
        </a>

        {/* Zone 2: 4 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <button
            type="button"
            onClick={() => setActiveTab('lookup')}
            className={`transition-colors whitespace-nowrap cursor-pointer pb-0.5 ${
              activeTab === 'lookup'
                ? 'text-white border-b-2 border-amber-400'
                : 'hover:text-white'
            }`}
          >
            Number Lookup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('browser')}
            className={`transition-colors whitespace-nowrap cursor-pointer pb-0.5 ${
              activeTab === 'browser'
                ? 'text-white border-b-2 border-amber-400'
                : 'hover:text-white'
            }`}
          >
            Dataset Rows
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apikeys')}
            className={`transition-colors whitespace-nowrap cursor-pointer pb-0.5 ${
              activeTab === 'apikeys'
                ? 'text-white border-b-2 border-amber-400'
                : 'hover:text-white'
            }`}
          >
            API Keys & cURL
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('github')}
            className={`transition-colors whitespace-nowrap cursor-pointer pb-0.5 ${
              activeTab === 'github'
                ? 'text-white border-b-2 border-amber-400'
                : 'hover:text-white'
            }`}
          >
            GitHub Host
          </button>
        </nav>

        {/* Zone 3: Primary actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleScanMoreRows}
            disabled={scanningBatches}
            className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors whitespace-nowrap cursor-pointer"
          >
            {scanningBatches
              ? 'Indexing +500 Rows...'
              : `Index +500 Rows (${indexedRowsCount.toLocaleString()} cached)`}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apikeys')}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
          >
            Create API Key
          </button>
        </div>
      </header>

      {/* Mobile Segmented Navigation Bar */}
      <div className="md:hidden px-4 pt-3">
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('lookup')}
            className={`py-1.5 text-xs font-medium rounded-md whitespace-nowrap truncate ${
              activeTab === 'lookup'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400'
            }`}
          >
            Lookup
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('browser')}
            className={`py-1.5 text-xs font-medium rounded-md whitespace-nowrap truncate ${
              activeTab === 'browser'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400'
            }`}
          >
            Rows
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apikeys')}
            className={`py-1.5 text-xs font-medium rounded-md whitespace-nowrap truncate ${
              activeTab === 'apikeys'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400'
            }`}
          >
            API Keys
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('github')}
            className={`py-1.5 text-xs font-medium rounded-md whitespace-nowrap truncate ${
              activeTab === 'github'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-400'
            }`}
          >
            GitHub Host
          </button>
        </div>
      </div>

      {/* Main Content Container (1440px baseline width) */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Dataset Context Strip (Zero-Pill Unboxed Metadata) */}
        <section className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
              <span>Dataset: {datasetId}</span>
              <span aria-hidden="true">·</span>
              <span>Config: {DEFAULT_CONFIG}</span>
              <span aria-hidden="true">·</span>
              <span>Split: {DEFAULT_SPLIT}</span>
              <span aria-hidden="true">·</span>
              <span>Total Rows: {numRowsTotal.toLocaleString()}</span>
              <span aria-hidden="true">·</span>
              <span>Size: 93.1 GB</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
              {activeTab === 'lookup' && 'Subscriber Number Lookup & Record Inspector'}
              {activeTab === 'browser' && 'Live Hugging Face Dataset Row Browser'}
              {activeTab === 'apikeys' && 'API Key Access Management & cURL Endpoints'}
              {activeTab === 'github' && 'GitHub Pages Static Host & Parquet Explorer'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-400">Target HF Dataset Repository</div>
              <input
                type="text"
                value={datasetId}
                onChange={(e) => setDatasetId(e.target.value)}
                className="mt-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500 w-60"
              />
            </div>
          </div>
        </section>

        {/* TAB 1: NUMBER LOOKUP WORKSPACE */}
        {activeTab === 'lookup' && (
          <div className="space-y-8">
            {/* Search Console Box */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleRunLookup(searchInput, false);
                }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-4"
              >
                <div className="lg:col-span-6">
                  <label className="block text-xs text-slate-400 mb-1.5">
                    Mobile Number, Subscriber Name, Document ID, or Address Keyword
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Enter 10-digit mobile number (e.g. 9999999891) or name..."
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="lg:col-span-4">
                  <label className="block text-xs text-slate-400 mb-1.5">
                    API Key for Request Authentication
                  </label>
                  <div className="relative">
                    <Key className="w-4 h-4 text-amber-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <select
                      value={selectedApiKey}
                      onChange={(e) => setSelectedApiKey(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                    >
                      {keys.map((k) => (
                        <option key={k.id} value={k.key}>
                          {k.name} ({k.key.slice(0, 14)}... · {k.status})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="lg:col-span-2 flex items-end">
                  <button
                    type="submit"
                    disabled={lookupLoading}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-semibold text-sm rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {lookupLoading ? 'Searching...' : 'Show Details'}
                  </button>
                </div>
              </form>

              {/* Quick Sample Numbers Bar from Live Dataset */}
              <div className="pt-3 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-400">Quick test numbers from dataset:</span>
                  {sampleNumbers.map((item) => (
                    <button
                      key={item.mobile}
                      type="button"
                      onClick={() => {
                        setSearchInput(item.mobile);
                        handleRunLookup(item.mobile, false);
                      }}
                      className={`px-2.5 py-1 rounded-md font-mono transition-colors cursor-pointer whitespace-nowrap ${
                        searchInput === item.mobile
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                    >
                      {item.mobile} ({item.name.split(' ')[0]})
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleRunLookup(searchInput, true)}
                  disabled={lookupLoading}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${lookupLoading ? 'animate-spin' : ''}`} />
                  <span>Force Live HF /filter Query</span>
                </button>
              </div>
            </div>

            {/* Error State */}
            {lookupError && (
              <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl flex items-center gap-3 text-sm text-rose-200">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                <span>{lookupError}</span>
              </div>
            )}

            {/* Lookup Execution Summary & Results */}
            {lookupResult && !lookupError && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400 font-mono tabular-nums">
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-slate-200 font-sans font-medium">
                      Found {lookupResult.count} matching record(s) for "{lookupResult.query}"
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Latency: {lookupResult.meta.latencyMs} ms</span>
                    <span aria-hidden="true">·</span>
                    <span>Source: {lookupResult.meta.source}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Indexed Window: {lookupResult.meta.indexedRowsInMemory.toLocaleString()} rows
                    </span>
                  </div>

                  {lookupResult.meta.hfIndexNotice && (
                    <span className="text-amber-400">
                      HF Note: {lookupResult.meta.hfIndexNotice}
                    </span>
                  )}
                </div>

                {lookupResult.matches.length === 0 ? (
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-8 text-center space-y-3">
                    <Database className="w-8 h-8 text-slate-500 mx-auto" />
                    <div className="text-base font-semibold text-white">
                      No subscriber found for "{lookupResult.query}" in currently indexed shards
                    </div>
                    <p className="text-xs text-slate-400 max-w-xl mx-auto leading-relaxed">
                      Because <span className="font-mono text-slate-300">{datasetId}</span> contains 1.78 billion rows (93.1 GB), Hugging Face’s remote DuckDB filter index may still be loading. Click below to index the next 500 rows from <span className="font-mono text-slate-300">/rows</span> or browse specific row offsets.
                    </p>
                    <div className="pt-2 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={handleScanMoreRows}
                        disabled={scanningBatches}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        {scanningBatches ? 'Scanning +500 Rows...' : 'Scan Next 500 Rows'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('browser')}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        Open Dataset Row Browser
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {lookupResult.matches.map((record) => (
                      <SubscriberDossierCard
                        key={record.row_idx}
                        record={record}
                        dataset={datasetId}
                        split={DEFAULT_SPLIT}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DATASET ROW BROWSER */}
        {activeTab === 'browser' && (
          <DatasetBrowserPanel
            rows={browserRows}
            offset={browserOffset}
            numRowsTotal={numRowsTotal}
            loading={browserLoading}
            onChangeOffset={handleLoadOffsetBatch}
            onRefresh={() => handleLoadOffsetBatch(browserOffset)}
            onInspectMobile={(mobileOrQuery) => {
              setSearchInput(mobileOrQuery);
              setActiveTab('lookup');
              handleRunLookup(mobileOrQuery, false);
            }}
          />
        )}

        {/* TAB 3: API KEYS & CURL ENDPOINTS */}
        {activeTab === 'apikeys' && (
          <ApiKeysPanel
            keys={keys}
            logs={logs}
            selectedApiKey={selectedApiKey}
            onSelectApiKey={setSelectedApiKey}
            onCreateKey={handleCreateApiKey}
            onToggleKeyStatus={handleToggleApiKey}
            onDeleteKey={handleDeleteApiKey}
            dataset={datasetId}
          />
        )}

        {/* TAB 4: GITHUB PAGES HOST & PARQUET INSPECTOR */}
        {activeTab === 'github' && (
          <GitHubHostPanel
            dataset={datasetId}
            config={DEFAULT_CONFIG}
            split={DEFAULT_SPLIT}
            keys={keys}
            selectedApiKey={selectedApiKey}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="mt-auto border-t border-slate-900 py-5 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            HiTek India Dataset Lookup & API Gateway · Connected to Hugging Face Dataset Server
          </div>
          <div className="flex items-center gap-4 font-mono">
            <button
              type="button"
              onClick={() => setActiveTab('apikeys')}
              className="hover:text-slate-300 cursor-pointer"
            >
              REST API v1
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setActiveTab('github')}
              className="hover:text-slate-300 cursor-pointer"
            >
              GitHub Pages Export
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
