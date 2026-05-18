'use client';
import { PLATFORMS_DATA } from '@/lib/data';

/**
 * Tools-used panel — shows the platforms that contributed (or could have
 * contributed) to the brief. Marks each platform USED vs AVAILABLE based
 * on the source labels actually present on the charts that loaded.
 */
export default function ToolsUsedPanel({ charts }) {
  const used = new Set(
    (charts || [])
      .map(c => (c.toolLabel || c.source || '').toString().toLowerCase())
      .filter(Boolean),
  );
  const isUsed = (p) => {
    const n = p.name.toLowerCase();
    return [...used].some(u =>
      n.includes(u) || u.includes(n) ||
      (n.includes('gwi') && u.includes('gwi')) ||
      (n.includes('helium') && u.includes('helium')) ||
      (n.includes('keyword') && u.includes('keyword')) ||
      (n.includes('trends') && u.includes('trend')) ||
      (n.includes('brandwatch') && u.includes('brandwatch')),
    );
  };
  return (
    <div style={{ marginTop: 28, background: '#fff', borderRadius: 14, padding: '20px 22px', boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>🛠 Tools used</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Platforms that contributed (or are available to contribute) to this brief.
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {PLATFORMS_DATA.map(p => {
          const u = isUsed(p);
          return (
            <div key={p.name} style={{
              padding: '10px 12px',
              border: `1px solid ${u ? '#A7F3D0' : '#E5E7EB'}`,
              background: u ? '#ECFDF5' : '#F9FAFB',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ fontSize: 18 }}>{p.icon}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{p.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.desc}
                </div>
              </div>
              <span style={{
                fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 999,
                background: u ? '#10B981' : '#E5E7EB',
                color: u ? '#fff' : '#6B7280',
                whiteSpace: 'nowrap',
              }}>{u ? 'USED' : 'AVAILABLE'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
