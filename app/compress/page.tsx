'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Quality = 'archive' | 'ebook' | 'screen' | 'printer' | 'prepress';

interface Result {
  blob:           Blob;
  originalBytes:  number;
  compressedBytes: number;
  ratio:          number;
  elapsedMs:      number;
  filename:       string;
}

const QUALITY_LABELS: Record<Quality, { label: string; sub: string }> = {
  screen:   { label: 'Smallest',     sub: 'Lowest quality · maximum compression · ~80–90% smaller' },
  ebook:    { label: 'Balanced',     sub: 'Good quality · big savings · ~60–80% smaller (recommended)' },
  archive:  { label: 'Archive',      sub: 'High quality · moderate savings · ~30–50% smaller' },
  printer:  { label: 'Print quality', sub: 'Near-original quality · ~20–40% smaller' },
  prepress: { label: 'Press quality', sub: 'Maximum quality · minimal compression · ~10–20% smaller' },
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1e6) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1e9) return `${(n / 1e6).toFixed(2)} MB`;
  return `${(n / 1e9).toFixed(2)} GB`;
}

export default function CompressPage() {
  const router = useRouter();
  const [file,    setFile]    = useState<File | null>(null);
  const [quality, setQuality] = useState<Quality>('ebook');
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState<string | null>(null);
  const [result,  setResult]  = useState<Result | null>(null);
  const [drag,    setDrag]    = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null | undefined) {
    setErr(null);
    setResult(null);
    if (!f) { setFile(null); return; }
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setErr('Only PDF files are supported.');
      return;
    }
    setFile(f);
  }

  async function compress() {
    if (!file) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch('/api/compress', {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type':    'application/pdf',
          'X-Filename':      encodeURIComponent(file.name),
          'X-Quality':       quality,
        },
      });

      if (!res.ok) {
        let msg = `Compression failed (HTTP ${res.status})`;
        try { const j = await res.json(); msg = j.message || msg; } catch {}
        if (res.status === 503) msg = 'Compression service is not configured yet. CLOUDCONVERT_API_KEY env var is missing on the server.';
        throw new Error(msg);
      }

      const blob = await res.blob();
      setResult({
        blob,
        originalBytes:   Number(res.headers.get('X-Original-Bytes')   ?? file.size),
        compressedBytes: Number(res.headers.get('X-Compressed-Bytes') ?? blob.size),
        ratio:           Number(res.headers.get('X-Ratio')            ?? '1'),
        elapsedMs:       Number(res.headers.get('X-Elapsed-Ms')       ?? '0'),
        filename:        file.name.replace(/\.pdf$/i, '') + '-compressed.pdf',
      });
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url; a.download = result.filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const savedPct = result ? Math.round((1 - result.ratio) * 100) : 0;
  const savedMB  = result ? (result.originalBytes - result.compressedBytes) / 1e6 : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4FF', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#0F172A,#1E1B4B)', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/dashboard" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#6366F1,#7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14 }}>P</div>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>PRISM</span>
            </div>
          </Link>
          <span style={{ color: 'rgba(255,255,255,.3)', fontSize: 14 }}>/</span>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Compress PDF</span>
        </div>
        <Link href="/dashboard" style={{ color: '#94A3B8', fontSize: 13, textDecoration: 'none' }}>← Back to app</Link>
      </div>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: '#0F172A', marginBottom: 6 }}>🗜 Compress PDF</h1>
        <p style={{ color: '#64748B', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
          Re-encode embedded images at lower quality to shrink large PDFs (typical 60–80% smaller).
          Powered by Ghostscript via CloudConvert. Files are auto-deleted after 24 hours.
        </p>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => {
            e.preventDefault(); setDrag(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          onClick={() => inputRef.current?.click()}
          style={{
            background: drag ? '#EFF6FF' : '#fff',
            border: `2px dashed ${drag ? '#2563EB' : '#CBD5E1'}`,
            borderRadius: 14, padding: '40px 24px',
            textAlign: 'center', cursor: 'pointer',
            marginBottom: 20,
            transition: 'all .15s',
          }}
        >
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
            onChange={e => pick(e.target.files?.[0])} />
          {!file ? (
            <>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 15, color: '#0F172A', fontWeight: 700 }}>Drop a PDF here or click to browse</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Up to 100 MB · stays on your machine until you click Compress</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 15, color: '#0F172A', fontWeight: 700 }}>{file.name}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{fmtBytes(file.size)} · click to change</div>
            </>
          )}
        </div>

        {/* Quality picker */}
        {file && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: '#0F172A', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>Quality</h3>
            {(['screen', 'ebook', 'archive', 'printer', 'prepress'] as Quality[]).map(q => (
              <label key={q} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', cursor: 'pointer' }}>
                <input type="radio" name="quality" value={q} checked={quality === q} onChange={() => setQuality(q)} />
                <span>
                  <span style={{ fontSize: 13, color: '#0F172A', fontWeight: 700 }}>{QUALITY_LABELS[q].label}</span>
                  <span style={{ fontSize: 11, color: '#64748B', marginLeft: 6 }}>{QUALITY_LABELS[q].sub}</span>
                </span>
              </label>
            ))}
          </div>
        )}

        {/* Action */}
        {file && !result && (
          <button onClick={compress} disabled={busy}
            style={{
              width: '100%', padding: '14px 24px', borderRadius: 12, border: 'none',
              background: busy ? '#94A3B8' : 'linear-gradient(135deg,#6366F1,#7C3AED)',
              color: '#fff', fontSize: 15, fontWeight: 800,
              cursor: busy ? 'wait' : 'pointer',
              boxShadow: busy ? 'none' : '0 4px 14px rgba(99,102,241,.4)',
              marginBottom: 16,
            }}>
            {busy ? '🗜 Compressing… (30–60 seconds for typical files)' : '🗜 Compress PDF'}
          </button>
        )}

        {/* Error */}
        {err && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '14px 18px', marginBottom: 16, color: '#991B1B', fontSize: 13, lineHeight: 1.5 }}>
            ❌ {err}
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ background: 'linear-gradient(135deg,#ECFDF5,#fff)', borderRadius: 14, padding: '24px 28px', boxShadow: '0 2px 8px rgba(5,150,105,.1)', marginBottom: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#065F46', marginBottom: 14 }}>✅ Compressed!</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
              <Stat label="Original" value={fmtBytes(result.originalBytes)} color="#64748B" />
              <Stat label="Compressed" value={fmtBytes(result.compressedBytes)} color="#059669" />
              <Stat label="Saved" value={`−${savedPct}% (${savedMB.toFixed(1)} MB)`} color="#059669" />
            </div>
            <button onClick={download}
              style={{
                width: '100%', padding: '14px 24px', borderRadius: 12, border: 'none',
                background: '#059669', color: '#fff',
                fontSize: 15, fontWeight: 800, cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(5,150,105,.3)',
              }}>
              ⬇ Download {result.filename}
            </button>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 12, textAlign: 'center' }}>
              Compression took {(result.elapsedMs / 1000).toFixed(1)}s · ready to upload back to PRISM at /upload
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 32, padding: 16, background: '#fff', borderRadius: 12, fontSize: 12, color: '#64748B', lineHeight: 1.6 }}>
          <strong>What this does:</strong> re-encodes embedded images at the chosen quality and strips redundant
          metadata. Text and vector content are preserved exactly. Use <strong>Balanced</strong> for most cases —
          it shrinks image-heavy PDFs by 60–80% while keeping images crisp at normal viewing.
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,.03)' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}
