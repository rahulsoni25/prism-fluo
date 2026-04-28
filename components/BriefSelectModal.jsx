'use client';
import { useEffect, useState } from 'react';
import { Loader2, X, AlertTriangle } from 'lucide-react';

export default function BriefSelectModal({ isOpen, onSelect, onCancel }) {
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch briefs when modal opens
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    fetch('/api/briefs')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setBriefs(data);
        } else if (data.briefs && Array.isArray(data.briefs)) {
          setBriefs(data.briefs);
        } else {
          setBriefs([]);
        }
      })
      .catch(err => {
        setError(`Failed to load briefs: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Select a Brief</h2>
            <p className="text-xs text-slate-500 mt-1">Choose which campaign this data belongs to</p>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={24} className="text-blue-600 animate-spin" />
              <p className="text-sm text-slate-500">Loading your briefs…</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && briefs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-slate-500">No briefs found. Create one first.</p>
            </div>
          )}

          {!loading && briefs.length > 0 && (
            <div className="space-y-3">
              {briefs.map(brief => (
                <button
                  key={brief.id}
                  onClick={() => onSelect(brief)}
                  className="w-full text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900 group-hover:text-blue-700">{brief.brand}</p>
                      {brief.category && (
                        <p className="text-xs text-slate-500 mt-1">{brief.category}</p>
                      )}
                      {brief.objective && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">{brief.objective}</p>
                      )}
                    </div>
                    <div className="ml-3">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                        brief.status === 'ready' ? 'bg-green-100 text-green-700' :
                        brief.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                        brief.status === 'waiting_for_data' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {brief.status === 'waiting_for_data' ? 'Awaiting Data' :
                         brief.status === 'processing' ? 'Processing' :
                         brief.status === 'ready' ? 'Ready' :
                         brief.status === 'draft' ? 'Draft' : brief.status}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
