'use client';
import { useState } from 'react';

/**
 * Confidence badge with hover tooltip — explains the conviction % shown on
 * every insight card. Pure presentation, no upstream state.
 */
export default function ConfidenceBadge({ confidence }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="ic-confidence"
      style={{ position: 'relative', cursor: 'default' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      ● {confidence}% confidence
      {show && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', right: 0,
          width: 272, background: '#0F172A', color: '#E2E8F0',
          fontSize: 11, lineHeight: 1.6, padding: '12px 14px',
          borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          zIndex: 200, whiteSpace: 'normal', textAlign: 'left',
          fontWeight: 400, letterSpacing: 0,
        }}>
          <strong style={{ display: 'block', marginBottom: 6, fontSize: 11.5, color: '#7DD3FC', fontWeight: 700 }}>
            PRISM Confidence Score
          </strong>
          Calculated from three weighted factors:
          <ul style={{ margin: '6px 0 8px 14px', padding: 0, listStyle: 'disc', color: '#CBD5E1', fontSize: 10.5 }}>
            <li>Data source quality — sample size, recency &amp; coverage</li>
            <li>Signal strength — statistical significance &amp; effect size</li>
            <li>Cross-source corroboration — independent sources in agreement</li>
          </ul>
          <span style={{ opacity: 0.65, fontSize: 10.5 }}>
            90–100% high conviction · 80–89% moderate · 70–79% emerging
          </span>
        </span>
      )}
    </span>
  );
}
