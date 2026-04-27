'use client';
/**
 * components/SlaSelectModal.jsx
 *
 * Modal for selecting a custom SLA (go-live time) for an upload.
 * Allows user to choose between 5 fixed SLA options and shows expected go-live time.
 *
 * Props:
 *   isOpen (bool): whether modal is visible
 *   onSelect (func): callback when SLA is selected, receives { slaHours }
 *   onBack (func): callback when user clicks back button
 *   briefName (string): name of selected brief to show in header
 *
 * Self-contained styling (inline) so it ships without touching globals.css
 */

import { useState, useEffect } from 'react';
import { ChevronLeft, Clock } from 'lucide-react';

export default function SlaSelectModal({ isOpen, onSelect, onBack, briefName = 'Your Brief' }) {
  const [selectedSla, setSelectedSla] = useState(null);

  const slaOptions = [
    { hours: 3, label: '3 Hours', description: 'Fastest delivery' },
    { hours: 6, label: '6 Hours', description: 'Standard delivery' },
    { hours: 12, label: '12 Hours', description: 'Half-day delivery' },
    { hours: 24, label: '24 Hours', description: 'Full-day delivery', isRecommended: true },
    { hours: 48, label: '48 Hours', description: 'Extra time' },
  ];

  if (!isOpen) return null;

  const handleSelect = (hours) => {
    setSelectedSla(hours);
    onSelect({ slaHours: hours });
  };

  const getGoLiveTime = (hours) => {
    const now = new Date();
    const goLive = new Date(now.getTime() + hours * 3600000);
    return goLive.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getGoLiveDate = (hours) => {
    const now = new Date();
    const goLive = new Date(now.getTime() + hours * 3600000);
    const isToday = now.toDateString() === goLive.toDateString();
    if (isToday) return 'Today';
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.toDateString() === goLive.toDateString()) return 'Tomorrow';
    return goLive.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
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
      maxWidth: 520,
      maxHeight: '90vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    header: {
      padding: '20px 24px',
      background: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
    },
    headerBackBtn: {
      background: 'rgba(255,255,255,0.18)',
      border: 'none',
      color: '#fff',
      cursor: 'pointer',
      borderRadius: 8,
      padding: '4px 8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerContent: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 700,
      margin: '0 0 2px 0',
    },
    headerSub: {
      fontSize: 12,
      opacity: 0.9,
      margin: 0,
    },
    body: {
      flex: 1,
      overflowY: 'auto',
      padding: '24px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
      gap: 12,
    },
    slaCard: (selected, recommended) => ({
      padding: 16,
      border: selected ? '2px solid #7C3AED' : recommended ? '2px solid #FBBF24' : '2px solid #E2E8F0',
      borderRadius: 12,
      background: selected ? '#F3E8FF' : recommended ? '#FFFBEB' : '#F8FAFC',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      textAlign: 'center',
      position: 'relative',
    }),
    recommendedBadge: {
      position: 'absolute',
      top: -10,
      right: 8,
      background: '#FBBF24',
      color: '#78350F',
      padding: '2px 8px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      textTransform: 'uppercase',
    },
    slaLabel: {
      fontSize: 16,
      fontWeight: 700,
      color: '#0F172A',
      margin: '8px 0 4px 0',
    },
    slaDescription: {
      fontSize: 11,
      color: '#64748B',
      margin: '0 0 12px 0',
    },
    slaTime: {
      fontSize: 12,
      fontWeight: 600,
      color: '#2563EB',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      margin: '4px 0 0 0',
    },
    slaDate: {
      fontSize: 10,
      color: '#64748B',
      margin: '2px 0 0 0',
    },
    footer: {
      padding: '16px 24px',
      background: '#F8FAFC',
      display: 'flex',
      justifyContent: 'center',
      borderTop: '1px solid #E2E8F0',
    },
    footerNote: {
      fontSize: 12,
      color: '#64748B',
      textAlign: 'center',
      maxWidth: 300,
    },
  };

  return (
    <div style={sx.overlay} onClick={onBack}>
      <div style={sx.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={sx.header}>
          <button style={sx.headerBackBtn} onClick={onBack} aria-label="Go back">
            <ChevronLeft size={20} />
          </button>
          <div style={sx.headerContent}>
            <h2 style={sx.headerTitle}>Select SLA</h2>
            <p style={sx.headerSub}>{briefName} — when should data go live?</p>
          </div>
        </div>

        {/* SLA Options Grid */}
        <div style={sx.body}>
          {slaOptions.map((option) => (
            <div
              key={option.hours}
              style={sx.slaCard(selectedSla === option.hours, option.isRecommended)}
              onClick={() => handleSelect(option.hours)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  handleSelect(option.hours);
                }
              }}
            >
              {option.isRecommended && (
                <div style={sx.recommendedBadge}>Recommended</div>
              )}

              <h3 style={sx.slaLabel}>{option.label}</h3>
              <p style={sx.slaDescription}>{option.description}</p>

              <div style={sx.slaTime}>
                <Clock size={12} />
                {getGoLiveTime(option.hours)}
              </div>
              <div style={sx.slaDate}>
                {getGoLiveDate(option.hours)}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={sx.footer}>
          <p style={sx.footerNote}>
            ℹ️ Select your preferred time frame. Analysis results will be ready by the chosen time.
          </p>
        </div>
      </div>
    </div>
  );
}
