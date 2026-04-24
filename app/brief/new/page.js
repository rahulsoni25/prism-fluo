'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';
import { PLATFORMS_DATA } from '@/lib/data';

const AGE_OPTIONS = ['13–17', '18–24', '25–34', '35–44', '45–54', '55+'];
const GEO_OPTIONS = ['Metro Cities', 'Tier 1', 'Tier 2', 'Tier 3', 'Rural'];
const BUCKET_OPTIONS = ['📝 Content', '🛒 Commerce', '📢 Communication', '🌍 Culture'];

export default function NewBrief() {
  const router = useRouter();
  const [brands, setBrands] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [showBrandAc, setShowBrandAc] = useState(false);
  const [showMarketAc, setShowMarketAc] = useState(false);
  const [showCompAc, setShowCompAc] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
  const [selectedBuckets, setSelectedBuckets] = useState(['📝 Content', '🛒 Commerce', '📢 Communication', '🌍 Culture']);

  const toggleItem = (list, setList, item) =>
    setList(list.includes(item) ? list.filter(i => i !== item) : [...list, item]);

  const submitBrief = async (status) => {
    if (!brandInput) return alert('Brand name is required');
    setSubmitting(true);
    try {
      const res = await fetch('/api/briefs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          status,
        }),
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
          <button className="back-btn" onClick={() => router.push('/dashboard')}>← Back to Dashboard</button>
          <div className="page-header">
            <div>
              <div className="page-title">New Insights Brief</div>
              <div className="page-sub">Fill the brief below — we'll mine insights from 7 live data platforms within 24 hrs</div>
            </div>
          </div>
          
          <div className="brief-layout">
            <div className="form-card">
              <div className="form-section-title">01 — Brand Information</div>
              <div className="form-group">
                <label>Brand Name *</label>
                <div className="ac-wrap">
                  <input 
                    type="text" 
                    value={brandInput}
                    onChange={(e) => {
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
                  <select value={category} onChange={e => setCategory(e.target.value)}>
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
                  <select value={objective} onChange={e => setObjective(e.target.value)}>
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
                  <select value={gender} onChange={e => setGender(e.target.value)}>
                    <option>All Genders</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Non-binary</option>
                    <option>Male + Female</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>SEC / Income Group</label>
                  <select value={sec} onChange={e => setSec(e.target.value)}>
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
                <label>Brief / Background (optional)</label>
                <textarea
                  placeholder="Share context about the pitch, product, or communication challenge…"
                  value={background}
                  onChange={e => setBackground(e.target.value)}
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
                <button className="btn btn-outline" style={{ flex: 1 }} disabled={submitting} onClick={() => submitBrief('draft')}>
                  Save as Draft
                </button>
                <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} disabled={submitting} onClick={() => submitBrief('processing')}>
                  {submitting ? 'Submitting…' : 'Submit Brief & Start Mining →'}
                </button>
              </div>
            </div>

            <div>
              <div className="sidebar-card">
                <div className="sidebar-title">Connected Platforms</div>
                {PLATFORMS_DATA.map((p, idx) => (
                  <div key={idx} className="platform-row">
                    <div className="platform-dot"></div>
                    <span className="platform-name-sm">{p.name}</span>
                    <span className="platform-live">Live</span>
                  </div>
                ))}
              </div>
              <div className="sla-card">
                <div className="sidebar-title">Delivery SLA</div>
                <div className="sla-val">24 hrs</div>
                <div className="sla-sub">You'll be notified when insights are ready</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
