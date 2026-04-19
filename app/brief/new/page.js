'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { useRouter } from 'next/navigation';
import { PLATFORMS_DATA } from '@/lib/data';

export default function NewBrief() {
  const router = useRouter();
  const [brands, setBrands] = useState([]);
  const [markets, setMarkets] = useState([]);
  const [showBrandAc, setShowBrandAc] = useState(false);
  const [showMarketAc, setShowMarketAc] = useState(false);
  const [showCompAc, setShowCompAc] = useState(false);
  
  const [brandInput, setBrandInput] = useState('');
  const [marketInput, setMarketInput] = useState('India');
  const [compInput, setCompInput] = useState('');

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

  const Chip = ({ children, initialSelected = false }) => {
    const [selected, setSelected] = useState(initialSelected);
    return (
      <div className={`chip ${selected ? 'selected' : ''}`} onClick={() => setSelected(!selected)}>
        {children}
      </div>
    );
  };

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
                  <select defaultValue="">
                    <option value="" disabled>Select category…</option>
                    <option>FMCG — Food & Beverages</option>
                    <option>Fashion & Apparel</option>
                    <option>Automotive</option>
                    <option>Telecom</option>
                    <option>Google Keyword Advertising</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Pitch Objective *</label>
                  <select defaultValue="">
                    <option value="" disabled>Select objective…</option>
                    <option>New Product Launch</option>
                    <option>New Communication / Campaign</option>
                    <option>Brand Refresh</option>
                  </select>
                </div>
              </div>

              <div className="divider"></div>
              <div className="form-section-title">02 — Target Audience & Demographics</div>
              
              <div className="form-group">
                <label>Age Range (select all that apply)</label>
                <div className="chips">
                  <Chip>13–17</Chip>
                  <Chip initialSelected>18–24</Chip>
                  <Chip initialSelected>25–34</Chip>
                  <Chip>35–44</Chip>
                  <Chip>45–54</Chip>
                  <Chip>55+</Chip>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group"><label>Gender</label><select><option>All Genders</option><option>Male</option><option>Female</option></select></div>
                <div className="form-group"><label>SEC / Income Group</label><select><option>All SECs</option><option>SEC A — Premium</option></select></div>
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
                  <Chip initialSelected>Metro Cities</Chip>
                  <Chip initialSelected>Tier 1</Chip>
                  <Chip initialSelected>Tier 2</Chip>
                  <Chip>Tier 3</Chip>
                  <Chip>Rural</Chip>
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
                <textarea placeholder="Share context about the pitch, product, or communication challenge…"></textarea>
              </div>

              <div className="form-group">
                <label>Prioritise Insight Buckets</label>
                <div className="chips">
                  <Chip initialSelected>📝 Content</Chip>
                  <Chip initialSelected>🛒 Commerce</Chip>
                  <Chip initialSelected>📢 Communication</Chip>
                  <Chip initialSelected>🌍 Culture</Chip>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button className="btn btn-outline" style={{ flex: 1 }}>Save as Draft</button>
                <button className="btn btn-primary" style={{ flex: 2, justifyContent: 'center' }} onClick={() => router.push('/brief/processing')}>
                  Submit Brief & Start Mining →
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
