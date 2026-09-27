import React, { useState } from 'react';
import { Key, Plus, Copy, Check, Trash2, ShieldAlert, ShieldCheck, Terminal } from 'lucide-react';
import {
  ApiKeyItem,
  ApiLogItem,
  getStoredHfToken,
  setStoredHfToken,
} from '../services/datasetClient';

interface ApiKeysPanelProps {
  keys: ApiKeyItem[];
  logs: ApiLogItem[];
  selectedApiKey: string;
  onSelectApiKey: (key: string) => void;
  onCreateKey: (name: string, rateLimit: number) => Promise<void>;
  onToggleKeyStatus: (key: string, status: 'active' | 'revoked') => Promise<void>;
  onDeleteKey: (key: string) => Promise<void>;
  dataset: string;
}

export const ApiKeysPanel: React.FC<ApiKeysPanelProps> = ({
  keys,
  logs,
  selectedApiKey,
  onSelectApiKey,
  onCreateKey,
  onToggleKeyStatus,
  onDeleteKey,
  dataset,
}) => {
  const [newKeyName, setNewKeyName] = useState('');
  const [newRateLimit, setNewRateLimit] = useState(1000);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hfTokenInput, setHfTokenInput] = useState(() => getStoredHfToken());
  const [hfSavedNotice, setHfSavedNotice] = useState(false);

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const encodedDataset = encodeURIComponent(dataset);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    try {
      await onCreateKey(newKeyName || 'Number Lookup Client Key', newRateLimit);
      setNewKeyName('');
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveHfToken = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredHfToken(hfTokenInput);
    setHfSavedNotice(true);
    setTimeout(() => setHfSavedNotice(false), 2000);
  };

  const hfBearerSnippet = hfTokenInput.trim()
    ? ` \\\n     -H "Authorization: Bearer ${hfTokenInput.trim()}"`
    : '';

  const curlCommands = [
    {
      id: 'curl_lookup',
      title: '01. Direct Number Info Lookup Endpoint',
      subtitle: 'Query mobile number details directly via GET /api/v1/lookup?number=...',
      cmd: `curl -X GET \\\n     "${originUrl}/api/v1/lookup?number=9999999891"`,
    },
    {
      id: 'curl_rows',
      title: '02. Hugging Face Dataset Server — Get Rows',
      subtitle: 'Fetch paginated rows (offset=0, length=100) from train split',
      cmd: `curl -X GET \\\n     "https://datasets-server.huggingface.co/rows?dataset=${encodedDataset}&config=default&split=train&offset=0&length=100"${hfBearerSnippet}`,
    },
    {
      id: 'curl_splits',
      title: '03. Hugging Face Dataset Server — List Splits',
      subtitle: 'List available configurations and split names',
      cmd: `curl -X GET \\\n     "https://datasets-server.huggingface.co/splits?dataset=${encodedDataset}"${hfBearerSnippet}`,
    },
    {
      id: 'curl_parquet',
      title: '04. Hugging Face Hub API — List Parquet Shards',
      subtitle: 'List underlying Parquet file URLs for default/train',
      cmd: `curl -X GET \\\n     "https://huggingface.co/api/datasets/${dataset}/parquet/default/train"${hfBearerSnippet}`,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Create API Key + Optional HF Token Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form
          onSubmit={handleCreateSubmit}
          className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-white">
              Generate API Key for Number Lookup
            </h2>
            <p className="text-sm text-slate-400">
              Create access keys to authenticate number detail requests via the web console, REST API, or GitHub Pages client.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1.5">
                Key Label / Client Application
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., GitHub Pages Lookup Portal"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Quota (Requests / Min)
              </label>
              <select
                value={newRateLimit}
                onChange={(e) => setNewRateLimit(Number(e.target.value))}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-amber-500"
              >
                <option value={100}>100 req/min</option>
                <option value={500}>500 req/min</option>
                <option value={1000}>1,000 req/min</option>
                <option value={5000}>5,000 req/min</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400 font-mono">
              Scopes: lookup:mobile · rows:read · splits:read · parquet:read
            </span>
            <button
              type="submit"
              disabled={isCreating}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{isCreating ? 'Creating Key...' : 'Create New API Key'}</span>
            </button>
          </div>
        </form>

        <form
          onSubmit={handleSaveHfToken}
          className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4"
        >
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-white">
              Hugging Face Read Token
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Optional: If you want higher rate limits or private access on <span className="font-mono text-slate-300">datasets-server.huggingface.co</span>, add your <span className="font-mono text-slate-300">hf_...</span> token.
            </p>
            <div className="pt-2">
              <label className="block text-xs text-slate-400 mb-1.5">
                Bearer Token (Optional)
              </label>
              <input
                type="password"
                value={hfTokenInput}
                onChange={(e) => setHfTokenInput(e.target.value)}
                placeholder="hf_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400">
              {hfSavedNotice
                ? 'Saved to local session'
                : hfTokenInput.trim()
                ? 'Token configured'
                : 'Using public dataset access'}
            </span>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Save HF Token
            </button>
          </div>
        </form>
      </div>

      {/* Active API Keys Table */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" />
            <h3 className="text-base font-semibold text-white">
              Issued API Access Keys ({keys.length})
            </h3>
          </div>
          <div className="text-xs text-slate-400 font-mono">
            Active Key in Console: {selectedApiKey.slice(0, 16)}...
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-3 px-6 font-medium">Key Name</th>
                <th className="py-3 px-4 font-medium">API Secret Key</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Requests</th>
                <th className="py-3 px-4 font-medium text-right">Rate Limit</th>
                <th className="py-3 px-6 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-sm">
              {keys.map((item) => {
                const isSelected = item.key === selectedApiKey;
                return (
                  <tr
                    key={item.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-amber-500/5' : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-3.5 px-6">
                      <div className="font-medium text-white">{item.name}</div>
                      <div className="text-xs text-slate-500 font-mono">
                        Created {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2 font-mono text-xs text-slate-200">
                        <span>{item.key}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(item.key, item.id)}
                          className="p-1 text-slate-400 hover:text-white cursor-pointer"
                          title="Copy full API key"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {item.status === 'active' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-rose-400 font-medium">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Revoked</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200">
                      {item.requestsCount.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-400 text-xs">
                      {item.rateLimit.toLocaleString()} / min
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectApiKey(item.key)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 font-semibold'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Use Key'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onToggleKeyStatus(
                              item.key,
                              item.status === 'active' ? 'revoked' : 'active'
                            )
                          }
                          className="px-3 py-1.5 text-xs font-medium bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {item.status === 'active' ? 'Revoke' : 'Activate'}
                        </button>
                        {keys.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onDeleteKey(item.key)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete key"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ready-to-Run cURL Endpoints */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-amber-400" />
          <h3 className="text-base font-semibold text-white">
            Dataset & Number Lookup cURL Reference
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {curlCommands.map((c) => (
            <div
              key={c.id}
              className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">{c.title}</h4>
                  <p className="text-xs text-slate-400 mt-0.5">{c.subtitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(c.cmd, c.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copiedId === c.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3.5 bg-slate-950 border border-slate-800/90 rounded-lg text-xs font-mono text-amber-200/90 overflow-x-auto leading-relaxed">
                {c.cmd}
              </pre>
            </div>
          ))}
        </div>
      </div>

      {/* Recent API Request Logs */}
      {logs.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <h3 className="text-base font-semibold text-white">
              Recent API Gateway Requests
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2.5 px-6 font-medium">Time</th>
                  <th className="py-2.5 px-4 font-medium">Endpoint</th>
                  <th className="py-2.5 px-4 font-medium">Query</th>
                  <th className="py-2.5 px-4 font-medium">Key Used</th>
                  <th className="py-2.5 px-4 font-medium text-right">Status</th>
                  <th className="py-2.5 px-6 font-medium text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {logs.slice(0, 10).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-6 text-slate-400 tabular-nums">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-4 text-slate-200">{log.endpoint}</td>
                    <td className="py-2.5 px-4 text-amber-300 truncate max-w-[200px]">
                      {log.query}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 font-sans">
                      {log.keyName}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums">
                      <span
                        className={
                          log.statusCode === 200 ? 'text-emerald-400' : 'text-rose-400'
                        }
                      >
                        HTTP {log.statusCode}
                      </span>
                    </td>
                    <td className="py-2.5 px-6 text-right text-slate-400 tabular-nums">
                      {log.latencyMs} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
