'use client';
/**
 * components/BriefSelectModal.jsx
 *
 * Modal for selecting a brief before uploading data.
 * Fetches user's briefs from /api/briefs and displays them in a selectable list.
 *
 * Props:
 *   isOpen (bool): whether modal is visible
 *   onSelect (func): callback when brief is selected, receives { id, brand, status, category }
 *   onCancel (func): callback when user cancels modal
 *
 * Self-contained styling (inline) so it ships without touching globals.css
 */

import { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';

export default function BriefSelectModal({ isOpen, onSelect, onCancel }) {
  const [briefs, setBriefs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchBriefs = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/briefs');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setBriefs(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBriefs();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = () => {
    if (selectedId) {
      const brief = briefs.find(b => b.id === selectedId);
      if (brief) onSelect(brief);
    }
  };

  const statusColors = {
    draft: '#64748B',
    waiting_for_data: '#F59E0B',
    processing: '#3B82F6',
    ready: '#10B981',
  };

  const statusLabels = {
    draft: 'Draft',
    waiting_for_data: 'Waiting for Data',
    processing: 'Processing',
    ready: 'Ready',
  };

  // ── Inline Styles ──
  const sx = {
    overlay: {
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    },
    modal: {
      background: '#fff',
      borderRadius: 20,
      boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
      width: '90%',
      maxWidth: 500,
      maxHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    header: {
      padding: '20px 24px',
      background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: 'none',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 700,
      margin: 0,
    },
    closeBtn: {
      background: 'transparent',
      border: 'none',
      color: '#fff',
      cursor: 'pointer',
      padding: '4px 8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px 0',
    },
    briefItem: (isSelected) => ({
      padding: '16px 24px',
      cursor: briefs.length > 0 ? 'pointer' : 'default',
      background: isSelected ? '#EFF6FF' : '#fff',
      borderLeft: isSelected ? '4px solid #2563EB' : '4px solid transparent',
      transition: 'all 0.15s ease',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      borderBottom: '1px solid #F1F5F9',
    }),
    briefContent: {
      flex: 1,
      minWidth: 0,
    },
    briefBrand: {
      fontSize: 15,
      fontWeight: 600,
      color: '#0F172A',
      margin: '0 0 4px 0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    briefMeta: {
      fontSize: 12,
      color: '#64748B',
      display: 'flex',
      gap: '8px',
      alignItems: 'center',
      flexWrap: 'wrap',
      margin: '4px 0 0 0',
    },
    briefStatus: (status) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 11,
      fontWeight: 600,
      color: statusColors[status] || '#64748B',
      padding: '2px 6px',
      background: `${statusColors[status] || '#64748B'}22`,
      borderRadius: 4,
    }),
    briefCheckbox: (isSelected) => ({
      width: 20,
      height: 20,
      borderRadius: 4,
      border: `2px solid ${isSelected ? '#2563EB' : '#CBD5E1'}`,
      background: isSelected ? '#2563EB' : '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontSize: 12,
      fontWeight: 700,
      flexShrink: 0,
    }),
    emptyState: {
      padding: '40px 24px',
      textAlign: 'center',
      color: '#64748B',
    },
    errorMsg: {
      padding: '16px 24px',
      background: '#FEE2E2',
      color: '#991B1B',
      borderRadius: 0,
      fontSize: 13,
      border: 'none',
    },
    footer: {
      padding: '16px 24px',
      background: '#F8FAFC',
      display: 'flex',
      gap: 10,
      justifyContent: 'flex-end',
      borderTop: '1px solid #E2E8F0',
    },
    btnCancel: {
      padding: '10px 20px',
      border: '1px solid #CBD5E1',
      background: '#fff',
      color: '#0F172A',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    },
    btnSelect: (disabled) => ({
      padding: '10px 20px',
      border: 'none',
      background: disabled ? '#CBD5E1' : '#2563EB',
      color: '#fff',
      borderRadius: 8,
      fontSize: 14,
      fontWeight: 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.15s ease',
    }),
  };

  return (
    <div style={sx.overlay} onClick={onCancel}>
      <div style={sx.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={sx.header}>
          <h2 style={sx.headerTitle}>Select a Brief</h2>
          <button style={sx.closeBtn} onClick={onCancel} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={sx.body}>
          {error && (
            <div style={sx.errorMsg}>
              {error === 'Unauthorized' ? 'Please log in to continue' : `Error: ${error}`}
            </div>
          )}

          {loading && (
            <div style={sx.emptyState}>
              <Loader2 size={24} style={{ margin: '0 auto 12px', animation: 'spin 1s linear infinite' }} />
              <p style={{ margin: 0 }}>Loading your briefs...</p>
            </div>
          )}

          {!loading && briefs.length === 0 && !error && (
            <div style={sx.emptyState}>
              <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>No briefs found</p>
              <p style={{ margin: 0, fontSize: 12 }}>Create a brief first to get started</p>
            </div>
          )}

          {!loading && briefs.length > 0 && (
            briefs.map((brief) => (
              <div
                key={brief.id}
                style={sx.briefItem(selectedId === brief.id)}
                onClick={() => setSelectedId(brief.id)}
                role="option"
                aria-selected={selectedId === brief.id}
              >
                <div style={sx.briefCheckbox(selectedId === brief.id)}>
                  {selectedId === brief.id && '✓'}
                </div>
                <div style={sx.briefContent}>
                  <h3 style={sx.briefBrand}>{brief.brand || 'Untitled Brief'}</h3>
                  <div style={sx.briefMeta}>
                    <span style={sx.briefStatus(brief.status)}>
                      {statusLabels[brief.status] || brief.status}
                    </span>
                    {brief.category && <span>• {brief.category}</span>}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={sx.footer}>
          <button style={sx.btnCancel} onClick={onCancel}>
            Cancel
          </button>
          <button
            style={sx.btnSelect(selectedId === null)}
            onClick={handleSelect}
            disabled={selectedId === null}
          >
            Continue
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
