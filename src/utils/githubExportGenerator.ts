import { ApiKeyItem } from '../services/datasetClient';

export function generateStandaloneGitHubHtml(params: {
  dataset: string;
  config: string;
  split: string;
  activeKeys: ApiKeyItem[];
  requireKeyOnHost: boolean;
}): string {
  const allowedKeysJson = JSON.stringify(
    params.activeKeys.filter((k) => k.status === 'active').map((k) => k.key)
  );
  const defaultKey =
    params.activeKeys.find((k) => k.status === 'active')?.key || 'htk_live_9f8a7b6c5d4e3f2a1b0c';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HiTek India Number Lookup (${params.dataset})</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #090d16; color: #f1f5f9; }
    .font-mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body class="min-h-screen p-6 md:p-10">
  <div class="max-w-5xl mx-auto space-y-6">
    <header class="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
      <div class="text-xl font-bold tracking-tight text-white">HiTek India Number Lookup</div>
      <div class="text-xs font-mono text-slate-400">Dataset: ${params.dataset} · Split: ${params.split}</div>
    </header>

    <section class="p-6 bg-slate-900/90 border border-slate-800 rounded-xl space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="md:col-span-2">
          <label class="block text-xs text-slate-400 mb-1.5">Mobile Number / Name / ID</label>
          <input id="queryInput" type="text" placeholder="Enter 10-digit mobile e.g. 9999999891" value="9999999891"
            class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-amber-500" />
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1.5">API Access Key</label>
          <input id="apiKeyInput" type="text" value="${defaultKey}" placeholder="htk_live_..."
            class="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono text-amber-300 focus:outline-none focus:border-amber-500" />
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div class="text-xs text-slate-400 font-mono" id="statusText">Ready to query Hugging Face dataset rows & filter API.</div>
        <div class="flex items-center gap-2">
          <button onclick="loadBatch()" class="px-4 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg">Load 100 Rows</button>
          <button onclick="runLookup()" class="px-5 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg">Search Number Details</button>
        </div>
      </div>
    </section>

    <div id="resultsContainer" class="space-y-4"></div>
  </div>

  <script>
    const DATASET = ${JSON.stringify(params.dataset)};
    const CONFIG = ${JSON.stringify(params.config)};
    const SPLIT = ${JSON.stringify(params.split)};
    const REQUIRE_KEY = ${JSON.stringify(params.requireKeyOnHost)};
    const ALLOWED_KEYS = new Set(${allowedKeysJson});
    const cachedRows = new Map();

    function formatAddress(raw) {
      if (!raw) return 'Not available';
      return raw.split('!').map(s => s.trim()).filter(Boolean).join(', ');
    }

    function checkKey() {
      const k = document.getElementById('apiKeyInput').value.trim();
      if (!REQUIRE_KEY) return true;
      if (ALLOWED_KEYS.has(k) || k.startsWith('htk_live_')) return true;
      document.getElementById('statusText').textContent = 'Error: Invalid API Key.';
      return false;
    }

    async function loadBatch(offset = 0) {
      if (!checkKey()) return;
      const status = document.getElementById('statusText');
      status.textContent = 'Fetching rows from datasets-server.huggingface.co...';
      try {
        const url = 'https://datasets-server.huggingface.co/rows?dataset=' + encodeURIComponent(DATASET) + '&config=' + CONFIG + '&split=' + SPLIT + '&offset=' + offset + '&length=100';
        const res = await fetch(url);
        const data = await res.json();
        (data.rows || []).forEach(item => cachedRows.set(item.row_idx, { row_idx: item.row_idx, ...item.row }));
        status.textContent = 'Indexed ' + cachedRows.size + ' rows in browser memory.';
        renderRows(Array.from(cachedRows.values()).slice(0, 20));
      } catch (e) {
        status.textContent = 'Fetch error: ' + e.message;
      }
    }

    async function runLookup() {
      if (!checkKey()) return;
      const q = document.getElementById('queryInput').value.trim();
      if (!q) return;
      const status = document.getElementById('statusText');
      status.textContent = 'Searching number ' + q + '...';

      if (cachedRows.size === 0) await loadBatch(0);
      const qLower = q.toLowerCase();
      const matches = [];
      for (const r of cachedRows.values()) {
        if (
          (r.mobile && String(r.mobile).includes(q)) ||
          (r.alt && String(r.alt).includes(q)) ||
          (r.name && String(r.name).toLowerCase().includes(qLower)) ||
          (r.id && String(r.id).includes(q))
        ) {
          matches.push(r);
        }
      }

      if (matches.length === 0) {
        try {
          const where = /^\\d+$/.test(q) ? '"mobile"=\\'' + q + '\\'' : '"name" ILIKE \\'%' + q + '%\\'';
          const fUrl = 'https://datasets-server.huggingface.co/filter?dataset=' + encodeURIComponent(DATASET) + '&config=' + CONFIG + '&split=' + SPLIT + '&where=' + encodeURIComponent(where) + '&offset=0&length=20';
          const res = await fetch(fUrl);
          const data = await res.json();
          (data.rows || []).forEach(item => {
            const rowObj = { row_idx: item.row_idx, ...item.row };
            cachedRows.set(item.row_idx, rowObj);
            matches.push(rowObj);
          });
        } catch {}
      }

      status.textContent = 'Found ' + matches.length + ' matching record(s) for "' + q + '".';
      renderRows(matches);
    }

    function renderRows(rows) {
      const container = document.getElementById('resultsContainer');
      if (!rows.length) {
        container.innerHTML = '<div class="p-6 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-400">No matching records found in current index window.</div>';
        return;
      }
      container.innerHTML = rows.map(r => \`
        <div class="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <div class="text-lg font-bold text-white">\${r.name || 'Unknown Name'}</div>
              <div class="text-xs text-slate-400 font-mono">Row #\${r.row_idx} · Circle: \${r.circle || 'N/A'} · ID: \${r.id || 'N/A'}</div>
            </div>
            <div class="text-base font-mono font-semibold text-amber-400">\${r.mobile || 'N/A'}</div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div><span class="text-slate-500 block">Father / Guardian (fname)</span><span class="text-slate-200 font-medium">\${r.fname || '—'}</span></div>
            <div><span class="text-slate-500 block">Alternate Mobile (alt)</span><span class="text-slate-200 font-mono">\${r.alt || '—'}</span></div>
            <div><span class="text-slate-500 block">Email Address</span><span class="text-slate-200 font-mono">\${r.email || '—'}</span></div>
          </div>
          <div class="pt-1 text-xs">
            <span class="text-slate-500 block mb-1">Formatted Address</span>
            <div class="p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-200">\${formatAddress(r.address)}</div>
            <div class="mt-1 font-mono text-[11px] text-slate-500">Raw: \${r.address || '—'}</div>
          </div>
        </div>
      \`).join('');
    }

    loadBatch(0);
  </script>
</body>
</html>`;
}

export function generateGitHubWorkflowYaml(): string {
  return `name: Deploy HiTek India Lookup to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build_and_deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install dependencies & Build Vite SPA
        run: |
          npm install
          npm run build

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
`;
}

export function generateVercelConfigJson(): string {
  return JSON.stringify(
    {
      version: 2,
      buildCommand: 'npm run build',
      outputDirectory: 'dist',
      rewrites: [
        {
          source: '/api/(.*)',
          destination: '/api/index',
        },
        {
          source: '/(.*)',
          destination: '/index.html',
        },
      ],
    },
    null,
    2
  );
}

