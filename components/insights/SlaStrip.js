'use client';
import { fmtTs } from '@/lib/insights/helpers';

/**
 * SLA strip rendered inside the dark insights hero. Shows planned vs actual
 * completion timestamps and the delta (ahead / behind / on time) coloured
 * accordingly. Renders nothing if no SLA data is present.
 */
export default function SlaStrip({ brief }) {
  const planned = brief.sla_due_at ? new Date(brief.sla_due_at) : null;
  const actual  = brief.actual_completed_at ? new Date(brief.actual_completed_at) : null;
  let delta = null;
  if (planned && actual) {
    const diffH = (actual.getTime() - planned.getTime()) / 36e5;
    if (Math.abs(diffH) >= 0.05) {
      delta = diffH < 0
        ? `${Math.abs(diffH).toFixed(diffH < -1 ? 0 : 1)}h ahead of plan`
        : `${diffH.toFixed(diffH > 1 ? 0 : 1)}h behind plan`;
    } else {
      delta = 'on time';
    }
  }
  const tone = delta?.includes('ahead') ? '#10B981'
            : delta?.includes('behind') ? '#F59E0B' : '#A78BFA';
  return (
    <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11, color: 'rgba(255,255,255,0.78)' }}>
      <span>📅 <strong style={{ color: '#fff' }}>Planned:</strong> {fmtTs(planned)}</span>
      {actual && <span>✅ <strong style={{ color: '#fff' }}>Actual:</strong> {fmtTs(actual)}</span>}
      {delta && (
        <span style={{ color: tone, fontWeight: 600 }}>
          {delta === 'on time' ? '✓ On time' : `↳ ${delta}`}
        </span>
      )}
    </div>
  );
}
