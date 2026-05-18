'use client';
import { useState, useEffect, Suspense } from 'react';
import Navbar from '@/components/Navbar';
import { useRouter, useSearchParams } from 'next/navigation';
import { PLATFORMS_DATA } from '@/lib/data';

const AGE_OPTIONS = ['13–17', '18–24', '25–34', '35–44', '45–54', '55+'];
const GEO_OPTIONS = ['Metro Cities', 'Tier 1', 'Tier 2', 'Tier 3', 'Rural'];
const BUCKET_OPTIONS = ['📝 Content', '🛒 Commerce', '📢 Communication', '🌍 Culture', '📡 Channel', '🎬 Media', '🎨 Creative', '💰 Pricing', '🔍 Search'];

function NewBriefInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  // ?from=<briefId> → pre-fill every field from that brief, then drop the
  // status/SLA so the user submits a fresh one.
  const fromBriefId  = searchParams.get('from');
  // ?edit=<briefId> → prefill AND save in-place (PATCH). The brief keeps its
  // status/SLA; only the editable fields change.
  const editBriefId  = searchParams.get('edit');
  const isEditMode   = Boolean(editBriefId);
  const [brands, setBrands] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [showBrandAc, setShowBrandAc] = useState(false);
  const [showMarketAc, setShowMarketAc] = useState(false);
  const [showCompAc, setShowCompAc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [brandInput, setBrandInput] = useState('');
  const [marketInput, setMarketInput] = useState('India');
  const [compInput, setCompInput] = useState('');
  const [category, setCategory] = useState('');
  const [objective, setObjective] = useState('');
  const [gender, setGender] = useState('All Genders');
  const [sec, setSec] = useState('All SECs');
  const [background, setBackground] = useState('');
  const [selectedAges, setSelectedAges] = useState(['18–24', '25–34']);
  const [selectedGeo, setSelectedGeo] = useState(['Metro Cities', 'Tier 1', 'Tier 2']);
  const [selectedBuckets, setSelectedBuckets] = useState(['📝 Content', '🛒 Commerce', '📢 Communication', '🌍 Culture', '📡 Channel', '🎬 Media', '🎨 Creative', '💰 Pricing', '🔍 Search']);

  const markDirty = () => setIsDirty(true);

  // Native beforeunload — fires when the user closes the tab / navigates
  // browser back / reloads while there are unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [isDirty]);

  // Confirmed cancel — for the Cancel button + back-to-dashboard link in
  // edit mode. In create mode this is a no-op (no destination).
  const safeCancel = () => {
    if (isDirty && !window.confirm('Discard your changes?')) return;
    router.push('/dashboard');
  };

  const toggleItem = (list, setList, item) => {
    markDirty();
    setList(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);
  };

  // Prefill from an existing brief when ?from=<id> or ?edit=<id> is present
  useEffect(() => {
    const sourceId = editBriefId || fromBriefId;
    if (!sourceId) return;
    let cancelled = false;
    fetch(`/api/briefs/${sourceId}`)
      .then(r => r.ok ? r.json() : null)
      .then(b => {
        if (cancelled || !b) return;
        if (b.brand)       setBrandInput(b.brand);
        if (b.market)      setMarketInput(b.market);
        if (b.competitors) setCompInput(b.competitors);
        if (b.category)    setCategory(b.category);
        if (b.objective)   setObjective(b.objective);
        if (b.gender)      setGender(b.gender);
        if (b.sec)         setSec(b.sec);
        if (b.background)  setBackground(b.background);
        if (b.age_ranges) {
          const list = String(b.age_ranges).split(',').map(s => s.trim()).filter(Boolean);
          if (list.length) setSelectedAges(list);
        }
        if (b.geography) {
          const list = String(b.geography).split(',').map(s => s.trim()).filter(Boolean);
          if (list.length) setSelectedGeo(list);
        }
        if (b.insight_buckets) {
          const list = String(b.insight_buckets).split(',').map(s => s.trim()).filter(Boolean);
          if (list.length) setSelectedBuckets(list);
        }
      })
      .catch(() => { /* best effort — silently ignore */ });
    return () => { cancelled = true; };
  }, [fromBriefId, editBriefId]);

  const submitBrief = async (status) => {
    if (!brandInput) return alert('Brand name is required');
    setSubmitting(true);
    try {
      const payload = {
        brand: brandInput,
        category,
        objective,
        age_ranges: selectedAges.join(', '),
        gender,
        sec,
        market: marketInput,
        geography: selectedGeo.join(', '),
        competitors: compInput,
        background,
        insight_buckets: selectedBuckets.join(', '),
      };

      if (isEditMode) {
        // Edit existing brief in place — keep its current status, just patch fields.
        const res = await fetch(`/api/briefs/${editBriefId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to save');
        router.push('/dashboard');
        return;
      }

      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, status }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      const created = await res.json();
      router.push(status === 'draft' ? '/dashboard' : `/brief/processing?id=${created.id}`);
    } catch (err) {
      alert('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const searchAPI = async (type, query, setter, showSetter) => {
    if (query.length < 2) {
      showSetter(false);
      return;
    }
    const res = await fetch(`/api/${type}?q=${query}`);
    const data = await res.json();
    setter(data);
    showSetter(data.length > 0);
  };

  const Chip = ({ children, selected, onToggle }) => (
    <div className={`chip ${selected ? 'selected' : ''}`} onClick={onToggle}>
      {children}
    </div>
  );

  return (
    <div className="screen fade-in">
      <Navbar />
      <div className="main">
        <div className="container">
          <button className="back-btn" onClick={safeCancel}>← Back to Dashboard</button>
          <div className="page-header">
            <div>
              <div className="page-title">{isEditMode ? 'Edit Brief' : 'New Insights Brief'}</div>
              <div className="page-sub">
                {isEditMode
                  ? 'Update brief details below — changes save in place without restarting analysis.'
                  : "Fill the brief below — we'll mine insights from 7 live data platforms within 24 hrs"}
              </div>
            </div>
          </div>
          
          <div className="brief-layout">
            <div className="form-card">
              <div className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                01 — Brand Information
                {brandInput.trim().length >= 2 && category && objective && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: '#059669',
                    background: '#ECFDF5', border: '1px solid #A7F3D0',
                    padding: '2px 8px', borderRadius: 10,
                    letterSpacing: '.04em',
                  }} title="All required fields in this section are filled">
                    ✓ Complete
                  </span>
                )}
              </div>
              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  Brand Name *
                  {brandInput.trim().length >= 2 && (
                    <span style={{ color: '#059669', fontSize: 11, fontWeight: 600 }}>✓</span>
                  )}
                  {brandInput.trim().length > 0 && brandInput.trim().length < 2 && (
                    <span style={{ color: '#D97706', fontSize: 11, fontWeight: 500 }}>
                      Keep typing…
                    </span>
                  )}
                </label>
                <div className="ac-wrap">
                  <input 
                    type="text" 
                    value={brandInput}
                    onChange={(e) => {
                      markDirty();
                      setBrandInput(e.target.value);
                      searchAPI('brands', e.target.value, setBrands, setShowBrandAc);
                    }}
                    placeholder="Start typing brand name…" 
                    autoComplete="off"
                  />
                  {showBrandAc && (
                    <div className="ac-list" style={{display: 'block'}}>
                      {brands.map(b => (
                        <div key={b} className="ac-item" onClick={() => { setBrandInput(b); setShowBrandAc(false); }}>{b}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Category *</label>
                  <select value={category} onChange={e => { markDirty(); setCategory(e.target.value); }}>
                    <option value="" disabled>Select category…</option>
                    <option>FMCG — Food &amp; Beverages</option>
                    <option>FMCG — Personal Care</option>
                    <option>FMCG — Home Care</option>
                    <option>Fashion &amp; Apparel</option>
                    <option>Sportswear &amp; Footwear</option>
                    <option>Electronics &amp; Technology</option>
                    <option>Automotive</option>
                    <option>Healthcare &amp; Wellness</option>
                    <option>Financial Services &amp; Fintech</option>
                    <option>Beauty &amp; Cosmetics</option>
                    <option>Luxury &amp; Premium Goods</option>
                    <option>E-commerce &amp; Retail</option>
                    <option>Food Service &amp; QSR</option>
                    <option>Travel &amp; Hospitality</option>
                    <option>Entertainment &amp; Media</option>
                    <option>EdTech &amp; Online Learning</option>
                    <option>Real Estate</option>
                    <option>Telecom</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Pitch Objective *</label>
                  <select value={objective} onChange={e => { markDirty(); setObjective(e.target.value); }}>
                    <option value="" disabled>Select objective…</option>
                    <option>New Product Launch</option>
                    <option>New Communication / Campaign</option>
                    <option>Brand Refresh</option>
                    <option>Market Entry</option>
                    <option>Competitive Repositioning</option>
                    <option>Annual Brand Planning</option>
                  </select>
                </div>
              </div>

              <div className="divider"></div>
              <div className="form-section-title">02 — Target Audience & Demographics</div>
              
              <div className="form-group">
                <label>Age Range (select all that apply)</label>
                <div className="chips">
                  {AGE_OPTIONS.map(a => (
                    <Chip key={a} selected={selectedAges.includes(a)} onToggle={() => toggleItem(selectedAges, setSelectedAges, a)}>{a}</Chip>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Gender</label>
                  <select value={gender} onChange={e => { markDirty(); setGender(e.target.value); }}>
                    <option>All Genders</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Non-binary</option>
                    <option>Male + Female</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>SEC / Income Group</label>
                  <select value={sec} onChange={e => { markDirty(); setSec(e.target.value); }}>
                    <option>All SECs</option>
                    <option>SEC A — Premium</option>
                    <option>SEC B — Upper-middle</option>
                    <option>SEC C — Middle</option>
                    <option>SEC A + B</option>
                    <option>SEC B + C</option>
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label>Target Market *</label>
                <div className="ac-wrap">
                  <input 
                    type="text" 
                    value={marketInput}
                    onChange={(e) => {
                      markDirty();
                      setMarketInput(e.target.value);
                      searchAPI('markets', e.target.value, setMarkets, setShowMarketAc);
                    }}
                    autoComplete="off"
                  />
                  {showMarketAc && (
                    <div className="ac-list" style={{display: 'block'}}>
                      {markets.map(m => (
                        <div key={m} className="ac-item" onClick={() => { setMarketInput(m); setShowMarketAc(false); }}>{m}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>Geography Scope</label>
                <div className="chips">
                  {GEO_OPTIONS.map(g => (
                    <Chip key={g} selected={selectedGeo.includes(g)} onToggle={() => toggleItem(selectedGeo, setSelectedGeo, g)}>{g}</Chip>
                  ))}
                </div>
              </div>

              <div className="divider"></div>
              <div className="form-section-title">03 — Competitive & Context</div>
              
              <div className="form-group">
                <label>Key Competitors</label>
                <div className="ac-wrap">
                  <input 
                    type="text" 
                    value={compInput}
                    onChange={(e) => {
                      markDirty();
                      setCompInput(e.target.value);
                      searchAPI('brands', e.target.value, setBrands, setShowCompAc);
                    }}
                    placeholder="e.g. Adidas, Puma, Reebok"
                    autoComplete="off"
                  />
                  {showCompAc && (
                    <div className="ac-list" style={{display: 'block'}}>
                      {brands.map(b => (
                        <div key={b} className="ac-item" onClick={() => { setCompInput(b); setShowCompAc(false); }}>{b}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Brief / Background (optional)</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: background.length >= 120 ? '#059669'
                         : background.length >= 40  ? '#D97706'
                         : '#94A3B8',
                  }}>
                    {background.length === 0
                      ? 'A few sentences help the AI ground its insights'
                      : `${background.length} chars${background.length >= 120 ? ' · great context' : background.length >= 40 ? ' · keep going' : ' · add a bit more'}`}
                  </span>
                </label>
                <textarea
                  placeholder="Share context about the pitch, product, or communication challenge…"
                  value={background}
                  onChange={e => { markDirty(); setBackground(e.target.value); }}
                />
              </div>

              <div className="form-group">
                <label>Prioritise Insight Buckets</label>
                <div className="chips">
                  {BUCKET_OPTIONS.map(b => (
                    <Chip key={b} selected={selectedBuckets.includes(b)} onToggle={() => toggleItem(selectedBuckets, setSelectedBuckets, b)}>{b}</Chip>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                {isEditMode ? (
                  <>
                    <button className="btn btn-outline" style={{ flex: 1 }} disabled={submitting} onClick={safeCancel}>
                      Cancel
                    </button>
                    <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={submitting} onClick={() => submitBrief()}>
                      {submitting ? 'Saving…' : 'Save Changes'}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Primary CTA dominates — Save as Draft is a small text
                        link, demoted per UX audit. */}
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, justifyContent: 'center', fontSize: 15, padding: '14px 24px' }}
                      disabled={submitting}
                      onClick={() => submitBrief('processing')}
                    >
                      {submitting ? 'Submitting…' : 'Submit Brief & Start Mining →'}
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => submitBrief('draft')}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: '#64748B', fontSize: 13, fontWeight: 600,
                        textDecoration: 'underline', padding: '0 14px',
                        fontFamily: 'inherit',
                      }}
                    >
                      Save as Draft
                    </button>
                  </>
                )}
              </div>
            </div>

            <div>
              <div className="sidebar-card">
                <div className="sidebar-title">Connected Platforms</div>

                {/* Dynamic source counter */}
                {(() => {
                  // While the form has unsaved changes, hold all platforms at Pending
                  // to avoid showing "Live" for a brief that hasn't been submitted yet.
                  const active = new Set();
                  if (!isDirty && brandInput.trim().length >= 2) {
                    active.add('Google Trends');
                    active.add('Google Keyword');
                    active.add('Brandwatch Sentiment');
                  }
                  if (!isDirty && category) {
                    active.add('Global Web Index (GWI)');
                    active.add('Comscore');
                  }
                  if (!isDirty && objective) {
                    active.add('Google Insights Finder');
                  }
                  if (!isDirty && (compInput.trim().length >= 1 || marketInput.trim())) {
                    active.add('SimilarWeb');
                  }
                  if (!isDirty && selectedBuckets.some(b => b.includes('Commerce'))) {
                    active.add('Helium10');
                  }
                  const n = active.size;
                  const total = PLATFORMS_DATA.length;
                  const allRequired = !!(brandInput.trim() && category && objective);
                  const barCls = n === 0 ? '' : n === total ? 'all-active' : 'has-active';

                  return (
                    <>
                      {/* Progress counter bar */}
                      <div className={`platform-source-bar ${barCls}`}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: n === 0 ? '#94A3B8' : n === total ? '#065F46' : '#1D4ED8' }}>
                          {n === 0
                            ? '🔒 Fill form to activate sources'
                            : n === total
                              ? `✅ All ${total} sources ready`
                              : `⚡ ${n} / ${total} sources ready`}
                        </span>
                        {n > 0 && (
                          <span style={{ fontSize: 11, fontWeight: 800, color: n === total ? '#059669' : '#2563EB' }}>
                            {Math.round(n / total * 100)}%
                          </span>
                        )}
                      </div>

                      {/* Mini progress bar */}
                      {n > 0 && (
                        <div className="progress-bar" style={{ marginBottom: 14, height: 4 }}>
                          <div className="progress-fill" style={{ width: `${Math.round(n / total * 100)}%`, transition: 'width 0.5s ease' }} />
                        </div>
                      )}

                      {/* Platform rows */}
                      {PLATFORMS_DATA.map((p, idx) => {
                        const isActive = active.has(p.name);
                        return (
                          <div key={idx} className={`platform-row ${isActive ? 'active' : 'pending'}`}>
                            <div className={`platform-dot ${isActive ? 'active' : 'pending'}`} />
                            <span className="platform-name-sm" style={{ color: isActive ? 'var(--text)' : '#94A3B8', transition: 'color 0.3s', fontWeight: isActive ? 600 : 400 }}>
                              {p.name}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? '#059669' : '#94A3B8', transition: 'color 0.3s' }}>
                              {isActive ? 'Live' : 'Pending'}
                            </span>
                          </div>
                        );
                      })}

                      {/* Ready banner when required fields complete */}
                      {allRequired && (
                        <div className="platform-ready-banner">
                          🚀 Brief ready — submit to start mining all sources
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div className="sla-card">
                <div className="sidebar-title">Delivery SLA</div>
                <div className="sla-val" style={{ fontSize: 22 }}>Set on upload</div>
                <div className="sla-sub">SLA is locked in after you upload data files — typically 4–24 hours depending on dataset size.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// useSearchParams must be wrapped in <Suspense> for Next.js App Router.
export default function NewBrief() {
  return (
    <Suspense fallback={
      <div className="screen">
        <Navbar />
        <div className="main"><p style={{ padding: 40, color: 'var(--muted)' }}>Loading…</p></div>
      </div>
    }>
      <NewBriefInner />
    </Suspense>
  );
}
