import React, { useState, useEffect } from 'react';
import {
  Download,
  Copy,
  Check,
  Database,
  FileCode,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import {
  ApiKeyItem,
  SplitItem,
  fetchDatasetSplitsAndParquet,
} from '../services/datasetClient';
import {
  generateStandaloneGitHubHtml,
  generateGitHubWorkflowYaml,
  generateVercelConfigJson,
} from '../utils/githubExportGenerator';

interface GitHubHostPanelProps {
  dataset: string;
  config: string;
  split: string;
  keys: ApiKeyItem[];
  selectedApiKey: string;
}

export const GitHubHostPanel: React.FC<GitHubHostPanelProps> = ({
  dataset,
  config,
  split,
  keys,
  selectedApiKey,
}) => {
  const [requireKeyOnHost, setRequireKeyOnHost] = useState(true);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [splits, setSplits] = useState<SplitItem[]>([]);
  const [parquetFiles, setParquetFiles] = useState<string[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const loadMetadata = async () => {
    setLoadingMeta(true);
    try {
      const res = await fetchDatasetSplitsAndParquet({
        dataset,
        config,
        split,
        apiKey: selectedApiKey,
      });
      setSplits(res.splits);
      setParquetFiles(res.parquetFiles);
    } finally {
      setLoadingMeta(false);
    }
  };

  useEffect(() => {
    loadMetadata();
  }, [dataset, config, split]);

  const standaloneHtml = generateStandaloneGitHubHtml({
    dataset,
    config,
    split,
    activeKeys: keys,
    requireKeyOnHost,
  });

  const workflowYaml = generateGitHubWorkflowYaml();
  const vercelConfigJson = generateVercelConfigJson();

  const handleDownloadHtml = () => {
    const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadVercelJson = () => {
    const blob = new Blob([vercelConfigJson], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vercel.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(label);
    setTimeout(() => setCopiedType(null), 1800);
  };

  return (
    <div className="space-y-8">
      {/* Vercel Deployment Setup Box */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-lg font-semibold text-white">
              01. Vercel Full-Stack Deployment (React UI + Serverless API)
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              This project already includes <span className="font-mono text-slate-200">/vercel.json</span> and <span className="font-mono text-slate-200">/api/index.ts</span>. Pushing to GitHub and importing into Vercel deploys both the frontend and the <span className="font-mono text-amber-300">/api/v1/lookup</span> API gateway automatically.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleCopy(vercelConfigJson, 'vercel_json')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {copiedType === 'vercel_json' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Copied vercel.json</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy vercel.json</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadVercelJson}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Download vercel.json</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80 text-xs">
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5">
            <div className="font-mono text-amber-400 font-semibold">Step 1 · Push to GitHub</div>
            <p className="text-slate-300 leading-relaxed">
              Export or push this project to a GitHub repository. <span className="font-mono text-slate-200">vercel.json</span> and <span className="font-mono text-slate-200">api/index.ts</span> are already configured in the root directory.
            </p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5">
            <div className="font-mono text-amber-400 font-semibold">Step 2 · Import in Vercel</div>
            <p className="text-slate-300 leading-relaxed">
              Go to <span className="font-mono text-slate-200">vercel.com/new</span>, import your GitHub repository, keep Framework Preset as <span className="font-mono text-slate-200">Vite</span>, and optionally add <span className="font-mono text-slate-200">HF_TOKEN</span> under Environment Variables.
            </p>
          </div>
          <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5">
            <div className="font-mono text-amber-400 font-semibold">Step 3 · Direct Lookup URL</div>
            <p className="text-slate-300 leading-relaxed">
              Query any number directly in browser or cURL at <span className="font-mono text-amber-300 break-all">https://your-project-name.vercel.app/api/v1/lookup?number=9999999891</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="text-xs font-mono text-slate-400">/vercel.json (Included in project)</div>
            <pre className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto">
              {vercelConfigJson}
            </pre>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-mono text-slate-400">Deploy via Vercel CLI (Alternative)</div>
            <pre className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-amber-200/90 overflow-x-auto leading-relaxed">
{`# 1. Install Vercel CLI
npm i -g vercel

# 2. Login and link project
vercel login

# 3. (Optional) Add Hugging Face Read Token
vercel env add HF_TOKEN

# 4. Deploy to production
vercel --prod`}
            </pre>
          </div>
        </div>
      </div>
      {/* Standalone GitHub Pages Export Box */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-lg font-semibold text-white">
              01. GitHub Pages Standalone Host Generator
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              Export a single self-contained <span className="font-mono text-slate-200">index.html</span> pre-wired with your active API keys and the <span className="font-mono text-slate-200">{dataset}</span> dataset endpoints. Upload it to any GitHub repository and enable GitHub Pages.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleCopy(standaloneHtml, 'html')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              {copiedType === 'html' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Copied HTML</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy index.html</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadHtml}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Download index.html</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
          <label className="flex items-center gap-2.5 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={requireKeyOnHost}
              onChange={(e) => setRequireKeyOnHost(e.target.checked)}
              className="rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0"
            />
            <span>Enforce API key validation inside exported GitHub Pages portal</span>
          </label>
          <span className="font-mono">
            Embedded Active Keys: {keys.filter((k) => k.status === 'active').length}
          </span>
        </div>

        <pre className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 max-h-60 overflow-y-auto">
          {standaloneHtml}
        </pre>
      </div>

      {/* Splits & Parquet Shards Live Inspector */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-amber-400" />
              <h2 className="text-lg font-semibold text-white">
                02. Dataset Splits & Parquet Shards Inspector
              </h2>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Live data from datasets-server.huggingface.co/splits & huggingface.co/api/datasets/{dataset}/parquet/{config}/{split}
            </p>
          </div>

          <button
            type="button"
            onClick={loadMetadata}
            disabled={loadingMeta}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingMeta ? 'animate-spin' : ''}`} />
            <span>Refresh Metadata</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Splits list */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-400">
              Configured Dataset Splits ({splits.length || 1})
            </div>
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-950">
              {(splits.length > 0
                ? splits
                : [{ dataset, config, split }]
              ).map((s, idx) => (
                <div
                  key={`${s.config}_${s.split}_${idx}`}
                  className="px-4 py-3 flex items-center justify-between text-xs font-mono"
                >
                  <span className="text-white">{s.dataset}</span>
                  <span className="text-slate-400">
                    config: <strong className="text-amber-300">{s.config}</strong> · split:{' '}
                    <strong className="text-emerald-400">{s.split}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Parquet files list */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-400">
              Parquet Shard Endpoints ({parquetFiles.length})
            </div>
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg bg-slate-950 max-h-48 overflow-y-auto">
              {parquetFiles.length === 0 ? (
                <div className="px-4 py-3 text-xs text-slate-500 font-mono">
                  {loadingMeta
                    ? 'Loading Parquet shard URLs...'
                    : `https://huggingface.co/api/datasets/${dataset}/parquet/${config}/${split}/0.parquet`}
                </div>
              ) : (
                parquetFiles.map((url, idx) => (
                  <div
                    key={idx}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 text-xs font-mono"
                  >
                    <span className="text-slate-300 truncate">{url}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopy(url, `pq_${idx}`)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        {copiedType === `pq_${idx}` ? 'Copied' : 'Copy'}
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-400 hover:text-amber-300"
                        title="Download Parquet Shard"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GitHub Actions Workflow */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-semibold text-white">
              03. GitHub Actions Workflow (.github/workflows/deploy.yml)
            </h2>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(workflowYaml, 'yaml')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            {copiedType === 'yaml' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied Workflow</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Workflow YAML</span>
              </>
            )}
          </button>
        </div>
        <pre className="p-4 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto">
          {workflowYaml}
        </pre>
      </div>
    </div>
  );
};
