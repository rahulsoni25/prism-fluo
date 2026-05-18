'use client';
import { useEffect, useState } from 'react';
import { fmtTs } from '@/lib/insights/helpers';

/**
 * Source-files panel — accordion. Collapsed by default; click the header to
 * reveal the scrollable file list. Loads its own data from
 * /api/briefs/[id]/files. Renders nothing while loading, on error, or when
 * the analysis has no brief link.
 */
export default function SourceFilesPanel({ briefId }) {
  const [files,    setFiles]    = useState(null);
  const [error,    setError]    = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!briefId) return;
    let cancelled = false;
    fetch(`/api/briefs/${briefId}/files`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) setFiles(Array.isArray(d) ? d : []); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [briefId]);

  if (!briefId || error || !Array.isArray(files) || files.length === 0) return null;

  return (
    <div style={{
      marginTop: 22, background: '#fff', borderRadius: 14,
      boxShadow: 'var(--shadow)', overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
          padding: '16px 22px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
          borderBottom: expanded ? '1px solid #F1F5F9' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>📂</span>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#111827' }}>
              Source Files
              <span style={{
                marginLeft: 8, fontSize: 11, fontWeight: 600,
                background: '#EEF2FF', color: '#4F46E5',
                padding: '1px 7px', borderRadius: 20,
              }}>{files.length}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
              {expanded ? 'Click to collapse' : 'Click to view files used to generate these insights'}
            </div>
          </div>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 16 16" fill="none"
          style={{ flexShrink: 0, transition: 'transform 0.22s ease', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path d="M4 6l4 4 4-4" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div style={{
          maxHeight: 280, overflowY: 'auto', padding: '12px 16px 16px',
          display: 'flex', flexDirection: 'column', gap: 7,
        }}>
          {files.map(f => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px',
              border: '1px solid #E5E7EB', borderRadius: 10,
              background: '#F9FAFB',
            }}>
              <div style={{ fontSize: 16 }}>📄</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.filename || '(unnamed file)'}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 1 }}>
                  {f.sheet_count ? `${f.sheet_count} sheet${f.sheet_count !== 1 ? 's' : ''} · ` : ''}
                  Uploaded {fmtTs(f.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
