import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  RefreshCw,
  ArrowUpRight,
  Download,
} from 'lucide-react';
import { SubscriberRecord } from '../services/datasetClient';

interface DatasetBrowserPanelProps {
  rows: SubscriberRecord[];
  offset: number;
  numRowsTotal: number;
  loading: boolean;
  onChangeOffset: (newOffset: number) => void;
  onInspectMobile: (mobileOrQuery: string) => void;
  onRefresh: () => void;
}

export const DatasetBrowserPanel: React.FC<DatasetBrowserPanelProps> = ({
  rows,
  offset,
  numRowsTotal,
  loading,
  onChangeOffset,
  onInspectMobile,
  onRefresh,
}) => {
  const [tableFilter, setTableFilter] = useState('');
  const [jumpOffsetInput, setJumpOffsetInput] = useState(String(offset));

  const filteredRows = rows.filter((r) => {
    if (!tableFilter.trim()) return true;
    const q = tableFilter.toLowerCase();
    return (
      (r.mobile && r.mobile.toLowerCase().includes(q)) ||
      (r.name && r.name.toLowerCase().includes(q)) ||
      (r.fname && r.fname.toLowerCase().includes(q)) ||
      (r.circle && r.circle.toLowerCase().includes(q)) ||
      (r.address && r.address.toLowerCase().includes(q)) ||
      (r.id && r.id.toLowerCase().includes(q))
    );
  });

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Math.max(0, parseInt(jumpOffsetInput.replace(/\D/g, ''), 10) || 0);
    onChangeOffset(parsed);
  };

  const handleExportCsv = () => {
    const headers = ['row_idx', 'mobile', 'name', 'fname', 'circle', 'alt', 'id', 'email', 'address'];
    const csvLines = [
      headers.join(','),
      ...filteredRows.map((r) =>
        headers
          .map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hitek-india-rows-${offset}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Controls Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              placeholder="Filter current 100 rows by mobile, name, circle..."
              className="w-full pl-9 pr-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <form onSubmit={handleJumpSubmit} className="flex items-center gap-2">
            <label className="text-xs text-slate-400 whitespace-nowrap">Offset:</label>
            <input
              type="text"
              value={jumpOffsetInput}
              onChange={(e) => setJumpOffsetInput(e.target.value)}
              className="w-28 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-amber-500 tabular-nums"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Go
            </button>
          </form>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = Math.max(0, offset - 100);
              setJumpOffsetInput(String(next));
              onChangeOffset(next);
            }}
            disabled={offset === 0 || loading}
            className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 disabled:opacity-40 text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Previous 100 rows"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-300 px-2 tabular-nums whitespace-nowrap">
            Rows {offset.toLocaleString()} – {(offset + rows.length).toLocaleString()} of{' '}
            {numRowsTotal.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = offset + 100;
              setJumpOffsetInput(String(next));
              onChangeOffset(next);
            }}
            disabled={loading}
            className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 disabled:opacity-40 text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Next 100 rows"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Reload batch"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* High-Density Data Grid */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th className="py-3 px-4 font-medium">Row #</th>
                <th className="py-3 px-4 font-medium">Mobile</th>
                <th className="py-3 px-4 font-medium">Subscriber Name</th>
                <th className="py-3 px-4 font-medium">Father Name (fname)</th>
                <th className="py-3 px-4 font-medium">Circle</th>
                <th className="py-3 px-4 font-medium">Address</th>
                <th className="py-3 px-4 font-medium text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {loading && rows.length === 0 ? (
                Array.from({ length: 8 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3 px-4">
                      <div className="h-4 w-12 bg-slate-800 rounded" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-24 bg-slate-800 rounded" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-32 bg-slate-800 rounded" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-28 bg-slate-800 rounded" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-24 bg-slate-800 rounded" />
                    </td>
                    <td className="py-3 px-4">
                      <div className="h-4 w-64 bg-slate-800 rounded" />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="h-4 w-14 bg-slate-800 rounded ml-auto" />
                    </td>
                  </tr>
                ))
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    No rows match your filter in this batch.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.row_idx}
                    onClick={() => onInspectMobile(String(row.mobile || row.name || ''))}
                    className="hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-4 font-mono text-slate-400 tabular-nums">
                      {row.row_idx.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-medium text-amber-400 tabular-nums whitespace-nowrap">
                      {row.mobile || '—'}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-white whitespace-nowrap">
                      {row.name || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">
                      {row.fname || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 font-mono whitespace-nowrap">
                      {row.circle || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 max-w-md truncate">
                      {row.parsedAddress?.formatted || row.address || '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onInspectMobile(String(row.mobile || row.name || ''));
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-400 hover:text-amber-300 whitespace-nowrap cursor-pointer"
                      >
                        <span>Inspect</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
