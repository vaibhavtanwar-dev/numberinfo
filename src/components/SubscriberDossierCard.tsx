import React, { useState } from 'react';
import { Copy, Check, Phone, User, MapPin, Mail, Hash, FileJson } from 'lucide-react';
import { SubscriberRecord, parseAddressClient } from '../services/datasetClient';

interface SubscriberDossierCardProps {
  record: SubscriberRecord;
  dataset: string;
  split: string;
}

export const SubscriberDossierCard: React.FC<SubscriberDossierCardProps> = ({
  record,
  dataset,
  split,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState(false);

  const parsed = record.parsedAddress || parseAddressClient(record.address);

  const handleCopy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1600);
  };

  return (
    <article className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 transition-colors hover:border-slate-700">
      {/* Header Row: Name + Unboxed Metadata + Primary Mobile */}
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
            <span>Row #{record.row_idx.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span>{record.circle || 'CIRCLE UNSPECIFIED'}</span>
            <span aria-hidden="true">·</span>
            <span>Split: {split}</span>
            {parsed.pincode && (
              <>
                <span aria-hidden="true">·</span>
                <span>PIN {parsed.pincode}</span>
              </>
            )}
          </div>
          <h3 className="text-xl font-semibold text-white tracking-tight">
            {record.name || 'Unnamed Subscriber'}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right mr-1">
            <div className="text-[11px] text-slate-400">Primary Mobile</div>
            <div className="text-lg font-mono font-semibold text-amber-400 tabular-nums">
              {record.mobile || 'N/A'}
            </div>
          </div>
          {record.mobile && (
            <button
              type="button"
              onClick={() => handleCopy(String(record.mobile), 'mobile')}
              className="p-2 text-slate-400 hover:text-white bg-slate-950 border border-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Copy mobile number"
            >
              {copiedField === 'mobile' ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Core Subscriber Fields Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 py-4 border-b border-slate-800/60">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <User className="w-3.5 h-3.5 text-slate-500" />
            <span>Father / Guardian Name (fname)</span>
          </div>
          <div className="text-sm font-medium text-slate-100">
            {record.fname || 'Not listed'}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Phone className="w-3.5 h-3.5 text-slate-500" />
            <span>Alternate Number (alt)</span>
          </div>
          <div className="text-sm font-mono text-slate-100 tabular-nums">
            {record.alt || 'None'}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Hash className="w-3.5 h-3.5 text-slate-500" />
            <span>Subscriber / Document ID (id)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-slate-100 tabular-nums truncate">
              {record.id || 'Not listed'}
            </span>
            {record.id && (
              <button
                type="button"
                onClick={() => handleCopy(String(record.id), 'id')}
                className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                {copiedField === 'id' ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Mail className="w-3.5 h-3.5 text-slate-500" />
            <span>Email Address (email)</span>
          </div>
          <div className="text-sm font-mono text-slate-100 truncate">
            {record.email || 'Not listed'}
          </div>
        </div>
      </div>

      {/* Address Breakdown */}
      <div className="pt-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <MapPin className="w-3.5 h-3.5 text-slate-500" />
            <span>Registered Address (Formatted & Raw)</span>
          </div>
          <div className="flex items-center gap-3">
            {record.address && (
              <button
                type="button"
                onClick={() => handleCopy(parsed.formatted, 'address')}
                className="text-xs text-slate-400 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                {copiedField === 'address' ? 'Address Copied' : 'Copy Address'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowRawJson((prev) => !prev)}
              className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>{showRawJson ? 'Hide Row JSON' : 'Inspect Row JSON'}</span>
            </button>
          </div>
        </div>

        <div className="text-sm text-slate-200 leading-relaxed">
          {parsed.formatted}
        </div>

        {record.address && (
          <div className="text-xs font-mono text-slate-500 break-all">
            Raw dataset value: {record.address}
          </div>
        )}
      </div>

      {showRawJson && (
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-slate-400">
              Dataset: {dataset} · row_idx: {record.row_idx}
            </span>
            <button
              type="button"
              onClick={() =>
                handleCopy(
                  JSON.stringify(
                    {
                      row_idx: record.row_idx,
                      mobile: record.mobile,
                      name: record.name,
                      fname: record.fname,
                      address: record.address,
                      alt: record.alt,
                      circle: record.circle,
                      id: record.id,
                      email: record.email,
                    },
                    null,
                    2
                  ),
                  'json'
                )
              }
              className="text-xs font-mono text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              {copiedField === 'json' ? 'Copied JSON' : 'Copy JSON'}
            </button>
          </div>
          <pre className="p-3 bg-slate-950 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto">
            {JSON.stringify(
              {
                row_idx: record.row_idx,
                mobile: record.mobile,
                name: record.name,
                fname: record.fname,
                address: record.address,
                alt: record.alt,
                circle: record.circle,
                id: record.id,
                email: record.email,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}
    </article>
  );
};
